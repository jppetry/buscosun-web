/**
 * Sub-Ansichten des Layers `fireDanger` (Phase E3, Gate GWBE1) — pur, DOM-frei.
 *
 * Bisher zeigte der Layer nur den Gesamtindex `ecmwf.fwi`. EFFIS/GWIS liefert
 * daneben die Bausteine, aus denen er entsteht, und — für DACH das Wichtigste —
 * die **Einordnung** des Tageswerts gegen die Historie desselben Ortes. Der
 * kanadische FWI ist für boreale und mediterrane Regime kalibriert; „High"
 * ist in Brandenburg etwas anderes als in Andalusien. Das Perzentil sagt, wie
 * außergewöhnlich der Tag *hier* ist. Deshalb steht die Einordnung neben dem
 * Index, und der Index nie allein.
 *
 * ── Warum je Ansicht eine EIGENE Legende ─────────────────────────────────────
 * Alle fünf WMS-Layer benutzen dieselbe Farbfolge (hellgrün → dunkelrot), aber
 * die Klassengrenzen und Einheiten sind völlig verschieden (E0, gemessen an den
 * `GetLegendGraphic`-Bildern, `audit/waldbrand-effis.md` §4.3). „Rot" heißt in
 * der Trockenheits-Ansicht DC > 749, in der Ausbreitungs-Ansicht ISI > 26,8.
 * Eine gemeinsame Legende wäre eine falsche Aussage in Bildform.
 *
 * ── Zwei Sprachregeln, die der Verifier erzwingt ─────────────────────────────
 *  • **`dc` heißt nie „Bodenfeuchte".** Der Drought Code ist ein Feuerwetter-
 *    Code (Modellwert für tiefe, verdichtete organische Auflagen, ~52-Tage-
 *    Gedächtnis), keine gemessene oder modellierte Bodenfeuchte. Die EDO-
 *    Bodenfeuchte (ehemals Layer `fireDrought`, zurückgezogen 2026-08-22)
 *    bleibt als nicht abrufbar benannt; DC ersetzt sie nicht.
 *  • **`ranking` nennt seine Baseline.** Die Quelle sagt „a historical series of
 *    approximately 40 years" — und nennt keine Jahre. Genau das steht in der
 *    Legende: benannt, mit benannter Unschärfe (§4.5 der Diagnose).
 *
 * `npm run verify:fire-danger-views` prüft beides an den Strings.
 */

import type { GwisFwiLayer } from './sources/gwisFwi';

export type DangerView = 'fwi' | 'ranking' | 'dc' | 'isi' | 'ffmc';

export const DANGER_VIEW_ORDER: readonly DangerView[] = ['fwi', 'ranking', 'dc', 'isi', 'ffmc'] as const;

/** Der Standard bleibt der Index — Funktionserhalt und bestehende Permalinks. */
export const DEFAULT_DANGER_VIEW: DangerView = 'fwi';

/** Eine Klasse der EFFIS-Legende — Grenzen wörtlich aus `GetLegendGraphic`. */
export interface DangerClass {
  /** EFFIS-Bezeichnung, unverändert. */
  name: 'Low' | 'Moderate' | 'High' | 'Very High' | 'Extreme' | 'Very Extreme';
  /** Bereich als Text, wie in der Legende (mit Einheit, wo es eine gibt). */
  range: string;
}

export interface DangerViewMeta {
  id: DangerView;
  /** WMS-Layer auf dem GWIS-Dienst. */
  layer: GwisFwiLayer;
  /** Kurzlabel im Untersegment. */
  label: string;
  /** Titel im Steckbrief. */
  title: string;
  /** Was die Ansicht beantwortet — ein Satz. */
  answers: string;
  /** Größe und Einheit — steht IN der Legende. */
  unit: string;
  /** Bezugsangabe: Modell, Referenzzeit, ggf. Referenzperiode. */
  reference: string;
  /** Die Grenze der Aussage — was die Größe NICHT ist. */
  limitation: string;
  classes: readonly DangerClass[];
}

const CLS = (ranges: readonly string[]): DangerClass[] => [
  { name: 'Low', range: ranges[0] },
  { name: 'Moderate', range: ranges[1] },
  { name: 'High', range: ranges[2] },
  { name: 'Very High', range: ranges[3] },
  { name: 'Extreme', range: ranges[4] },
  { name: 'Very Extreme', range: ranges[5] },
];

/**
 * Die Referenzperiode des Perzentils — **wörtlich, was die Quelle sagt**.
 * EFFIS/GWIS: „compared to a historical series of approximately 40 years";
 * Jahreszahlen nennt die Seite nicht. Die zugrunde liegende JRC/ECMWF-
 * Klimatologie (ERA5, Vitolo et al. 2020) umfasst 1980–2018 — dass die
 * operative Ranking-Ebene genau sie nutzt, sagt EFFIS nirgends ausdrücklich.
 */
export const RANKING_REFERENCE =
  'Perzentil gegenüber einer ~40-jährigen historischen Reihe für diesen Ort (Angabe EFFIS/GWIS; '
  + 'die genauen Jahre veröffentlicht EFFIS nicht — Basisklimatologie voraussichtlich ERA5 1980–2018, '
  + 'Vitolo et al. 2020)';

export const DANGER_VIEWS: Record<DangerView, DangerViewMeta> = {
  fwi: {
    id: 'fwi',
    layer: 'ecmwf.fwi',
    label: 'Index',
    title: 'Gefahrenindex (FWI)',
    answers: 'Wie hoch ist die Feuerwettergefahr laut Gesamtindex?',
    unit: 'Fire Weather Index, dimensionslos',
    reference: 'ECMWF-Vorhersage, Tageswert (Bezug 12 UTC), ~8 km · Copernicus EMS GWIS',
    limitation: 'Modellwert, kein amtliches Warnprodukt. Der kanadische FWI ist für boreale und mediterrane Regime kalibriert — für DACH ist die absolute Klasse ein Modellwert; was der Tag hier bedeutet, sagt die Einordnung daneben.',
    classes: CLS(['< 11,2', '11,2–21,3', '21,3–38,0', '38,0–50,0', '50,0–70,0', '> 70,0']),
  },
  ranking: {
    id: 'ranking',
    layer: 'ecmwf.ranking',
    label: 'Einordnung',
    title: 'Einordnung (Perzentil)',
    answers: 'Wie außergewöhnlich ist der heutige Wert für diesen Ort und diese Jahreszeit?',
    unit: 'Perzentil in %',
    reference: RANKING_REFERENCE,
    limitation: 'Ein hohes Perzentil heißt „ungewöhnlich für hier", nicht „absolut extrem" — und umgekehrt. Modellwert, kein amtliches Warnprodukt.',
    classes: CLS(['≤ 80', '80–90', '90–95', '95–98', '98–99', '> 99']),
  },
  dc: {
    id: 'dc',
    layer: 'ecmwf.dc',
    label: 'Trockenheit',
    title: 'Trockenheit der Streuauflage (Modellwert)',
    answers: 'Wie ausgetrocknet sind tiefe, verdichtete organische Auflagen — die Größe mit dem längsten Gedächtnis (~52 Tage)?',
    unit: 'Drought Code (DC), dimensionslos',
    reference: 'ECMWF-Vorhersage, Tageswert (Bezug 12 UTC), ~8 km · Copernicus EMS GWIS',
    limitation: 'Ein Feuerwetter-Code, keine gemessene oder modellierte Feuchte des Erdbodens. Die Copernicus-EDO-Größe dazu (Bodenfeuchte-Anomalie) ist wegen ungültigem CORS nicht abrufbar und seit 2026-08-22 kein Layer mehr — dieser Code ersetzt sie nicht. Modellwert, kein amtliches Warnprodukt.',
    classes: CLS(['< 256,1', '256,1–334,1', '334,1–450,6', '450,6–600,0', '600,0–749,4', '> 749,4']),
  },
  isi: {
    id: 'isi',
    layer: 'ecmwf.isi',
    label: 'Ausbreitung',
    title: 'Ausbreitung (ISI)',
    answers: 'Wie schnell würde sich ein Feuer unmittelbar nach der Zündung ausbreiten — Feinstoff-Feuchte × Wind?',
    unit: 'Initial Spread Index (ISI), dimensionslos',
    reference: 'ECMWF-Vorhersage, Tageswert (Bezug 12 UTC), ~8 km · Copernicus EMS GWIS · Wind aus demselben Modell — der ICON-D2-Windlayer der Wetterkarte ist die feinere Ergänzung',
    limitation: 'Erwartete Ausbreitungsrate im Modell, keine Beobachtung. Modellwert, kein amtliches Warnprodukt.',
    classes: CLS(['< 3,2', '3,2–5,0', '5,0–7,5', '7,5–13,4', '13,4–26,8', '> 26,8']),
  },
  ffmc: {
    id: 'ffmc',
    layer: 'ecmwf.ffmc',
    label: 'Zündbereitschaft',
    title: 'Zündbereitschaft (FFMC)',
    answers: 'Wie leicht zündet feines Material — Gras, Nadeln, Laub — heute? (Gedächtnis ~⅔ Tag)',
    unit: 'Fine Fuel Moisture Code (FFMC), dimensionslos',
    reference: 'ECMWF-Vorhersage, Tageswert (Bezug 12 UTC), ~8 km · Copernicus EMS GWIS',
    limitation: 'Feuchte des Feinmaterials im Modell, kein amtliches Warnprodukt. Sagt nichts über tiefere Auflagen (dafür: Trockenheit).',
    classes: CLS(['< 82,7', '82,7–86,1', '86,1–89,2', '89,2–93,0', '93,0–96,0', '> 96,0']),
  },
};

export function isDangerView(v: unknown): v is DangerView {
  return typeof v === 'string' && (DANGER_VIEW_ORDER as readonly string[]).includes(v);
}

/** Der Begleiter des Index: die Einordnung — und umgekehrt. Sonst keiner. */
export function companionView(v: DangerView): DangerView | null {
  return v === 'fwi' ? 'ranking' : v === 'ranking' ? 'fwi' : null;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei) — läuft in verify:fire-danger-views
// ---------------------------------------------------------------------------

export interface DangerViewCheck { name: string; ok: boolean; detail?: string }

export function verifyDangerViews(): { checks: DangerViewCheck[]; passed: number; total: number } {
  const checks: DangerViewCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const all = DANGER_VIEW_ORDER.map((v) => DANGER_VIEWS[v]);

  add('genau die vier Zusatz-Ansichten aus dem Auftrag + Index',
    DANGER_VIEW_ORDER.join(',') === 'fwi,ranking,dc,isi,ffmc');
  add('dmc und bui sind NICHT enthalten (außerhalb des Auftrags)',
    !all.some((m) => /dmc|bui/.test(m.layer)));
  add('jede Ansicht hat eine eigene Legende mit 6 Klassen', all.every((m) => m.classes.length === 6));
  add('die Klassengrenzen sind je Ansicht verschieden (keine geteilte Legende)',
    new Set(all.map((m) => m.classes.map((c) => c.range).join('|'))).size === all.length);
  add('jede Ansicht nennt Einheit, Bezug und Grenze',
    all.every((m) => m.unit.length > 5 && m.reference.length > 20 && m.limitation.length > 30));
  add('jede Ansicht zeigt auf einen ecmwf.*-Layer', all.every((m) => m.layer.startsWith('ecmwf.')));
  add('Layer sind paarweise verschieden', new Set(all.map((m) => m.layer)).size === all.length);
  add('EFFIS-Klassennamen unverändert (Low … Very Extreme)',
    all.every((m) => m.classes.map((c) => c.name).join(',') === 'Low,Moderate,High,Very High,Extreme,Very Extreme'));

  // --- Sprachregel 1: dc ist nie Bodenfeuchte ---------------------------------
  const dc = DANGER_VIEWS.dc;
  const dcText = [dc.label, dc.title, dc.answers, dc.unit, dc.reference].join(' ');
  add('dc: Titel heißt „Trockenheit der Streuauflage (Modellwert)"',
    dc.title === 'Trockenheit der Streuauflage (Modellwert)');
  add('dc: kein „Bodenfeuchte" in Label/Titel/Antwort/Einheit/Bezug', !/bodenfeucht/i.test(dcText), dcText);
  add('dc: die Grenze sagt ausdrücklich, dass es KEINE Feuchte des Erdbodens ist',
    /keine gemessene oder modellierte Feuchte des Erdbodens/.test(dc.limitation));
  add('dc: EDO bleibt als nicht abrufbar benannt, DC ersetzt sie nicht',
    /EDO/.test(dc.limitation) && /nicht abrufbar/.test(dc.limitation) && /ersetzt sie nicht/.test(dc.limitation));

  // --- Sprachregel 2: ranking nennt seine Baseline ----------------------------
  const rk = DANGER_VIEWS.ranking;
  add('ranking: Einheit ist Perzentil', /Perzentil/.test(rk.unit));
  add('ranking: Bezug nennt die ~40-jährige Reihe UND die Quelle',
    /40-jährig/.test(rk.reference) && /EFFIS/.test(rk.reference));
  add('ranking: Bezug verschweigt die Unschärfe nicht',
    /genauen Jahre veröffentlicht EFFIS nicht/.test(rk.reference));
  add('ranking: Klassen sind die EFFIS-Perzentilgrenzen 80/90/95/98/99',
    rk.classes.map((c) => c.range).join('|') === '≤ 80|80–90|90–95|95–98|98–99|> 99');

  // --- Der Index steht nie allein: sein Begleiter ist die Einordnung ---------
  add('Begleiter des Index ist die Einordnung, und umgekehrt',
    companionView('fwi') === 'ranking' && companionView('ranking') === 'fwi');
  add('die Code-Ansichten haben keinen Begleiter',
    companionView('dc') === null && companionView('isi') === null && companionView('ffmc') === null);
  add('fwi: die Grenze verweist auf die Einordnung', /Einordnung/.test(DANGER_VIEWS.fwi.limitation));
  add('Standard ist der Index (Funktionserhalt)', DEFAULT_DANGER_VIEW === 'fwi');

  // --- Kein amtliches Warnprodukt: in jeder Grenze ---------------------------
  add('jede Ansicht sagt „kein amtliches Warnprodukt"',
    all.every((m) => /kein amtliches Warnprodukt/.test(m.limitation)));
  add('isDangerView trennt sauber',
    isDangerView('dc') && !isDangerView('bui') && !isDangerView(42) && !isDangerView(''));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
