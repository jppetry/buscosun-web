/**
 * Brandradar „Command-Deck" — Präsentations-Metadaten (rein, DOM-frei).
 *
 * Was die Vorlage `references/brandradar.dc.html` je Layer zeigt: Zeilenlabel,
 * Kurzquelle, Zeilenfarbe, sowie die Steckbrief-Felder EINHEIT / BEZUG / GRENZE /
 * RÜCKFALL. Verhaltensneutral — Layer-Listen, Presets, Z-Bänder und Zeitmodell
 * bleiben in `fireModel.ts`/`fireTime.ts`; diese Datei ordnet nur fürs Auge.
 *
 * Die Ehrlichkeits-Sätze sind Teil des Designs (Kickoff): Grenze nennt, was die
 * Größe NICHT ist; Rückfall sagt, was bei Ausfall passiert — nie eine leere
 * Fläche, die wie „keine Gefahr" aussähe.
 */

import type { FireLayerId } from './fireModel';
import type { DangerView } from './dangerViews';
import { DANGER_VIEWS } from './dangerViews';
import { FIRE_WEATHER_AHEAD_H } from '../sources/iconD2FireWeather';
import type { FireStatusKind } from './footprint/fireRegistry';

/** Farbfamilien der Vorlage — als Token-Namen, aufgelöst in `fireDeck.css`. */
export type BrColor = 'red' | 'amber' | 'terra' | 'steel' | 'slate' | 'sage' | 'stone';

export interface BrLayerMeta {
  /** Zeilenlabel im Dock (Vorlage). */
  label: string;
  /** Kurzquelle unter dem Label — leer bei Brennmaterial/Frühere Brandflächen (Vorlage). */
  sub: string;
  /** Sub-Zeile der Tablet-Fassung ist ausgeblendet; Label dort kürzer (Vorlage B3). */
  shortLabel?: string;
  /** Icon-/Akzentfarbe der Zeile. */
  color: BrColor;
  /** Gruppen-Eyebrow im Steckbrief („STECKBRIEF · GEFAHRENLAGE"). */
  group: string;
  /** Titel des Steckbriefs. */
  title: string;
  /** Die Frage, die der Layer beantwortet — ein Satz. */
  question: string;
  unit: string;
  reference: string;
  /** Grenze der Aussage — was die Größe NICHT ist. Pflicht. */
  limit: string;
  /** Rückfall-Verhalten bei Ausfall der Quelle. */
  fallback: string;
}

export const BR_GROUP_COLOR: Record<string, BrColor> = {
  'Gefahrenlage': 'terra',
  'Aktuelle Lage': 'steel',
  'Aus der Wetterkarte': 'steel',
  'Ausbreitung (Modell)': 'terra',
  'Ausbaustufe 2': 'stone',
};

const NO_DATA = 'Antwortet die Quelle nicht, zeigt der Layer nichts und die Zeile sagt „keine Daten" — nicht „keine Gefahr".';

export const BR_LAYER: Record<FireLayerId, BrLayerMeta> = {
  fireDanger: {
    label: 'EU-Gefahrenindex', sub: 'GWIS · ~8 km · 5 Ansichten', color: 'amber',
    group: 'Gefahrenlage', title: 'Gefahrenindex (FWI)',
    question: DANGER_VIEWS.fwi.answers,
    unit: DANGER_VIEWS.fwi.unit,
    reference: 'ECMWF-Vorhersage, Tageswert (12 UTC), ~8 km · Copernicus EMS GWIS',
    limit: 'Modellwert, kein amtliches Warnprodukt. Der kanadische FWI ist für boreale und mediterrane Regime kalibriert — was der Tag hier bedeutet, sagt die Einordnung daneben.',
    fallback: 'Antwortet GWIS nicht, bleibt die Fläche leer und die Zeile meldet den Ausfall — der EU-Wert wird nie aus einer Nachbarquelle ersetzt und nie mit einer nationalen Stufe verrechnet.',
  },
  fireHotspots: {
    label: 'Detektionen', sub: 'NASA FIRMS · VIIRS', color: 'red',
    group: 'Aktuelle Lage', title: 'Detektionen (Thermalanomalien)',
    question: 'Wo hat der Satellit im Rückblickfenster Wärme gesehen — und wie stark?',
    unit: 'Feuerstrahlungsleistung (FRP) in MW je Pixel · Konfidenz hoch/nominal/gering',
    reference: 'NASA FIRMS / LANCE · VIIRS 375 m (NRT) · 24 h / 7 Tage · Rückfall: Copernicus GWIS',
    limit: 'Satellitendetektion, keine Einsatzmeldung und kein amtliches Warnprodukt. Der Punkt ist die Pixelmitte, nicht der Brandort; kleine Bodenfeuer unter der Pixelgröße bleiben unsichtbar — „keine Hotspots" heißt nicht „keine Brände".',
    fallback: 'Fällt FIRMS aus, zeigt der Layer GWIS-Punkte ohne Intensität und sagt das — eine ärmere Anzeige wird nie als volle ausgegeben.',
  },
  fireFootprints: {
    label: 'Brandflächen je Brand', shortLabel: 'Brandflächen', sub: 'Registry · EFFIS-Kartierung', color: 'stone',
    group: 'Aktuelle Lage', title: 'Brandflächen je Brand (Registry)',
    question: 'Welche Detektionen gehören zu EINEM Brand, und wie groß ist seine Fläche?',
    unit: 'Fläche in ha — kartiert (EFFIS) oder Obergrenze (Detektionsraster) · Status',
    reference: 'NASA FIRMS (Detektionen, zusammengefasst) + Copernicus EFFIS (Kartierung) + Copernicus EMS · Fenster wie die Detektionen',
    limit: 'Ein Brand ist eine Detektionsgruppe, keine amtliche Meldung. Ohne EFFIS-Kartierung ist die Fläche eine Obergrenze aus dem Detektionsraster (ein VIIRS-Pixel deckt 14–60 ha) bzw. eine vorläufige Schätzung mit Intervall — keine gemessene Brandfläche.',
    fallback: 'Fehlt die EFFIS-Kartierung (Ausfall oder noch nicht bearbeitet), bleibt die Form das Raster und die Fläche heißt ausdrücklich „geschätzt" — die Kartierung läuft 1–3 Tage nach.',
  },
  fireWeather: {
    label: 'Feuerwetter-Treiber', shortLabel: 'Feuerwetter', sub: 'ICON-D2 rel. Feuchte', color: 'slate',
    group: 'Aktuelle Lage', title: 'Feuerwetter-Treiber (Trockenheit der Luft)',
    question: 'Wie trocken ist die Luft — und damit wie schnell trocknet Streu ab?',
    unit: 'Relative Feuchte in 2 m, % (je dunkler, desto trockener)',
    reference: 'DWD ICON-D2 · 2,2 km · stündlich bis +24 h ab Lauf',
    limit: 'Ein Treiber, kein Index und kein amtliches Warnprodukt. Die kumulativen FWI-Codes (FFMC, DMC, DC) sind nicht enthalten. Außerhalb von DE, AT und CH ist die Fläche abgedunkelt.',
    fallback: NO_DATA,
  },
  fireWind: {
    label: 'Wind', sub: 'ICON-D2 u/v 10 m · 1:1', color: 'slate',
    group: 'Aus der Wetterkarte', title: 'Wind (10 m)',
    question: 'Wohin würde ein Feuer laufen, und wie schnell — nach dem Wind in 10 m Höhe?',
    unit: 'Windrichtung und -geschwindigkeit 10 m, Partikel über Geschwindigkeits-Heatmap',
    reference: 'DWD ICON-D2 u/v 10 m · 2,2 km · derselbe Layer wie auf der Wetterkarte (1:1) · Stundenachse bis +6 h',
    limit: 'Ein Treiber, kein Index und kein amtliches Warnprodukt. 10 m über Grund ist die Messhöhe der Meteorologie, nicht der Wind im Bestand; Böen sind nicht enthalten.',
    fallback: 'Reicht der geladene Lauf nicht bis zur Zielzeit, zeigt der Layer den letzten verfügbaren Schritt und sagt das in seiner Zeile — kein stilles Klemmen.',
  },
  fireSoilDryness: {
    label: 'Bodentrockenheit', sub: 'ICON-D2 smi · 2 Tiefen', color: 'sage',
    group: 'Aus der Wetterkarte', title: 'Bodentrockenheit (SMI)',
    question: 'Wie steht es um das Wasser im Boden — oben (Zündrisiko) und in der Wurzelzone (Dürre)?',
    unit: 'Bodenfeuchte-Index (SMI), 0 = Welkepunkt · 1 = Feldkapazität',
    reference: 'DWD ICON-D2 smi · Oberboden bis 9 cm / Wurzelzone bis 81 cm · 2,2 km · bis +24 h',
    limit: 'Modellwert, keine Messung — es gibt kein flächendeckendes Bodenfeuchte-Messnetz. Ein Treiber, kein Index und kein amtliches Warnprodukt; Wasser, Fels und Eis bleiben leer.',
    fallback: NO_DATA,
  },
  fireSpread: {
    label: 'Ausbreitungsrichtung', shortLabel: 'Ausbreitung', sub: 'FBP · Pfeil + Unsicherheitsfächer', color: 'terra',
    group: 'Ausbreitung (Modell)', title: 'Ausbreitungsrichtung (FBP)',
    question: 'In welche Richtung würde sich ein aktiver Brand bei diesem Wetter und Gelände am schnellsten ausbreiten?',
    unit: 'Richtung (Pfeil), Fächer = Unsicherheit, Reichweite als Spanne über vier Brennstofftypen',
    reference: `ICON-D2-Wind + stündlicher ISI + Höhenmodell · FBP (Forestry Canada 1992 / Wotton u. a. 2009) · jetzt bis +${FIRE_WEATHER_AHEAD_H} h`,
    limit: 'Modellrechnung — keine Brandfront, keine gefährdete Fläche, keine Warnung, kein amtliches Produkt. Der Bewuchs ist eine Annahme; ohne Vortagsgedächtnis ist die Reichweite eine Untergrenze.',
    fallback: 'Ohne Wind-Frame, Gelände oder Satellitensignal gibt es keinen Pfeil — und die Brandliste nennt den Grund. Kein Pfeil heißt nie „keine Ausbreitung".',
  },
  fireFuel: {
    label: 'Brennmaterial', sub: '', color: 'sage',
    group: 'Ausbaustufe 2', title: 'Brennmaterial',
    question: 'Welches Material könnte überhaupt brennen?',
    unit: '13 Brennmaterial-Klassen (aus 42 Vegetationskomplexen)',
    reference: 'Copernicus EFFIS · European Fuel Map, Stand 2017',
    limit: 'Eine Bestandsaufnahme von 2017, keine Beobachtung — Kalamitäten, Aufforstungen und Waldumbau seither fehlen. Kein amtliches Warnprodukt.',
    fallback: NO_DATA,
  },
  fireBurnt: {
    label: 'Frühere Brandflächen', sub: '', color: 'terra',
    group: 'Ausbaustufe 2', title: 'Kartierte Brandflächen',
    question: 'Wo hat es in dieser Saison und in früheren Jahren nachweislich gebrannt?',
    unit: 'Kartierte Fläche in ha, Branddatum, Landbedeckungsanteile',
    reference: 'Copernicus EFFIS · Rapid Damage Assessment · Saison live + Archiv (nur auf Wunsch, ~5 MB)',
    limit: 'Fehlende Kartierung ist kein Beleg gegen ein Feuer: kleine, kurze und frische Brände fehlen. Eingefärbt nach Landbedeckung — was gebrannt hat, nicht Gefahr. Kein amtliches Warnprodukt.',
    fallback: 'Scheitert ein Zeitkorb, sagt die Zeile welcher — der andere bleibt stehen; Zeitspanne und Stand kommen aus den Daten, nicht aus einer Annahme.',
  },
  fireContext: {
    label: 'Schutzgebiete', sub: 'Natura 2000 · CH fehlt', color: 'sage',
    group: 'Ausbaustufe 2', title: 'Schutzgebiete & Landbedeckung',
    question: 'Was wäre im Brandfall besonders zu schützen, und wie ist die Fläche bedeckt?',
    unit: 'Natura-2000-Gebiete · CORINE-Landbedeckung 2018',
    reference: 'EEA · Natura 2000 und CORINE Land Cover 2018',
    limit: 'Natura 2000 deckt die SCHWEIZ NICHT ab — eine leere Schweiz heißt „nicht erfasst", nicht „keine Schutzgebiete". Kein amtliches Warnprodukt.',
    fallback: NO_DATA,
  },
  fireDrought: {
    label: 'Bodenfeuchte-Anomalie', sub: 'EDO blockiert · ungültiges CORS', color: 'stone',
    group: 'Ausbaustufe 2 · blockiert', title: 'Bodenfeuchte-Anomalie (EDO)',
    question: 'Wie weicht die Bodenfeuchte vom langjährigen Mittel ab?',
    unit: 'Soil Moisture Anomaly (SMA), standardisiert',
    reference: 'Copernicus EDO · derzeit nicht abrufbar',
    limit: 'Blockiert: Der EDO-Dienst sendet einen fehlerhaften CORS-Header (doppeltes Access-Control-Allow-Origin) — der Browser darf die Kacheln nicht lesen. Die Sub-Ansicht „Trockenheit" des EU-Index (Drought Code) ist KEIN Ersatz: ein Feuerwetter-Code, keine Bodenfeuchte.',
    fallback: 'Der Layer bleibt sichtbar und deaktiviert: die Größe existiert, nur die Quelle ist nicht erreichbar.',
  },
  fireVegetation: {
    label: 'Vegetationszustand', sub: 'EDO blockiert · ungültiges CORS', color: 'stone',
    group: 'Ausbaustufe 2 · blockiert', title: 'Vegetationszustand (EDO)',
    question: 'Steht die Vegetation unter Stress?',
    unit: 'fAPAR-Anomalie',
    reference: 'Copernicus EDO · derzeit nicht abrufbar',
    limit: 'Blockiert: derselbe Dienst, derselbe fehlerhafte CORS-Header. Vegetationsstress ist nicht gleich Trockenheit — auch Schädlinge, Hitze oder Sturmschäden schlagen durch.',
    fallback: 'Der Layer bleibt sichtbar und deaktiviert: die Größe existiert, nur die Quelle ist nicht erreichbar.',
  },
};

/** Die Steckbrief-Felder des EU-Index je Sub-Ansicht — aus `dangerViews.ts`. */
export function dangerCardMeta(view: DangerView): BrLayerMeta {
  const m = DANGER_VIEWS[view];
  return {
    ...BR_LAYER.fireDanger,
    title: m.title,
    question: m.answers,
    unit: m.unit,
    reference: m.reference,
    limit: m.limitation,
  };
}

/** Kurzcode der Sub-Ansicht für „LEGENDE · FWI" und die Quellen-Pille. */
export const DANGER_VIEW_CODE: Record<DangerView, string> = {
  fwi: 'FWI', ranking: 'Perzentil', dc: 'DC', isi: 'ISI', ffmc: 'FFMC',
};

/** Die sechs EFFIS-Klassenfarben (Low → Very Extreme) — Token-Namen, s. `--br-fwi-*`. */
export const FWI_STEPS = ['#8FBF6B', '#D6D24E', '#E9A33C', '#D4632E', '#A32B1E', '#6B1410'] as const;

/**
 * Status-Abzeichen der Brandliste. Die Wörter kommen aus der Registry
 * (`STATUS_LABEL`: aktiv / kein Signal / erloschen) — „beobachtet" der Vorlage
 * wäre eine Umdeutung von „kein Signal" und steht deshalb NICHT hier.
 */
export type BrBadge = 'active' | 'no-signal' | 'out' | 'static';
export const BR_BADGE_LABEL: Record<BrBadge, string> = {
  active: 'AKTIV', 'no-signal': 'KEIN SIGNAL', out: 'ERLOSCHEN', static: 'ORTSFEST',
};
export function badgeOf(kind: FireStatusKind, suspectedStatic: boolean): BrBadge {
  return suspectedStatic ? 'static' : kind;
}
