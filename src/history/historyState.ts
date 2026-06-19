/**
 * Feature „Wetterhistorie" — Ansichtszustand, Permalink, Favoriten, Fragen.
 *
 * - `HistorySettings`: gemeinsamer Zustand (Variable, Auflösung, Zeitraum,
 *   Referenzperiode, Diagrammtyp, Kenntag, Schwellen). Bleibt über Ort-/Diagramm-
 *   wechsel erhalten (US-1.6).
 * - Permalink-Codierung (US-10.3): Zustand ⇄ URL-Hash, „geteilt = exakt".
 * - Favoriten/Zuletzt (US-1.5) in localStorage.
 * - Fragen-Kacheln (E2) + Freitext→Zustand-Mapping (US-2.5).
 */

import type { VariableKey, Resolution } from './historyModel';
import type { KenntagKey } from './historyModel';

export type ChartType =
  | 'stripes' | 'anomaly' | 'dayband' | 'calendar' | 'overlay'
  | 'bands' | 'box' | 'windrose' | 'kenntage' | 'records' | 'dateLookup' | 'line';

export type PeriodPreset = 'last-year' | '10y' | '30y' | 'all' | 'custom';

export interface HistoryLocation { name: string; lat: number; lon: number; admin?: string; country?: string; elevation?: number }

/** Hauptmodus: Veränderung/Trend ODER konkreten Zeitpunkt erkunden. */
export type HistoryMode = 'change' | 'explore';
export type ExploreGranularity = 'day' | 'month' | 'year';

export interface HistorySettings {
  mode: HistoryMode;
  /** Zeitpunkt-Erkunden (Tag/Monat/Jahr) + konkretes Datum. */
  exploreGran: ExploreGranularity;
  exploreYear: number;
  exploreMonth: number;
  exploreDay: number;
  variable: VariableKey;
  resolution: Resolution;
  period: PeriodPreset;
  customStart: number; // Jahr
  customEnd: number;   // Jahr
  normalPeriodId: string;
  chart: ChartType;
  kenntag: KenntagKey;
  /** überschriebene Kenntag-Schwelle (US-4.5); null = Standard. */
  kenntagThreshold: number | null;
  /** Monatsfilter (E3.6); leer = alle. */
  months: number[];
  showLabels: boolean; // Streifen-Beschriftung (US-6.2)
  showTrend: boolean;  // Trendlinie (US-5.3)
  /** Datum für „Wetter an meinem Tag" (E8.3). */
  lookupMonth: number;
  lookupDay: number;
  /** Drill-down-Fokusjahr (E7). */
  focusYear: number | null;
}

export const DEFAULT_SETTINGS: HistorySettings = {
  mode: 'change', exploreGran: 'month', exploreYear: new Date().getFullYear() - 1, exploreMonth: 7, exploreDay: 14,
  variable: 'tmean', resolution: 'yearly', period: 'all', customStart: 1990, customEnd: new Date().getFullYear(),
  normalPeriodId: '1961-1990', chart: 'stripes', kenntag: 'hot', kenntagThreshold: null, months: [],
  showLabels: false, showTrend: true, lookupMonth: 7, lookupDay: 14, focusYear: null,
};

/** Konkreter Jahresbereich aus dem Preset + verfügbarem Gesamtbereich (US-3.2/3.4). */
export function resolveYearRange(s: HistorySettings, available: { min: number; max: number } | null): { start: number; end: number } {
  const avMax = available?.max ?? DEFAULT_SETTINGS.customEnd;
  const avMin = available?.min ?? 1940;
  switch (s.period) {
    case 'last-year': return { start: avMax, end: avMax };
    case '10y': return { start: Math.max(avMin, avMax - 9), end: avMax };
    case '30y': return { start: Math.max(avMin, avMax - 29), end: avMax };
    case 'all': return { start: avMin, end: avMax };
    case 'custom': return { start: Math.max(avMin, s.customStart), end: Math.min(avMax, s.customEnd) };
  }
}

// --- Permalink (US-10.3) -----------------------------------------------------

/** Kodiert Ort + Zustand in einen Hash-String („#h=…"). */
export function encodeState(loc: HistoryLocation | null, s: HistorySettings): string {
  const p = new URLSearchParams();
  if (loc) { p.set('n', loc.name); p.set('ll', `${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`); if (loc.admin) p.set('a', loc.admin); }
  if (s.mode === 'explore') { p.set('mo', 'explore'); p.set('eg', s.exploreGran); p.set('ed', `${s.exploreYear}.${s.exploreMonth}.${s.exploreDay}`); }
  p.set('v', s.variable); p.set('r', s.resolution); p.set('p', s.period);
  if (s.period === 'custom') p.set('cs', `${s.customStart}-${s.customEnd}`);
  p.set('np', s.normalPeriodId); p.set('c', s.chart); p.set('k', s.kenntag);
  if (s.kenntagThreshold != null) p.set('kt', String(s.kenntagThreshold));
  if (s.months.length) p.set('m', s.months.join('.'));
  if (s.showLabels) p.set('lbl', '1');
  if (!s.showTrend) p.set('tr', '0');
  if (s.chart === 'dateLookup') p.set('d', `${s.lookupMonth}.${s.lookupDay}`);
  if (s.focusYear) p.set('fy', String(s.focusYear));
  return p.toString();
}

export interface DecodedState { loc: HistoryLocation | null; settings: HistorySettings }

/** Liest Ort + Zustand aus einem Hash-String. Robust gegen fehlende Felder. */
export function decodeState(hash: string): DecodedState | null {
  const raw = hash.replace(/^#h?=?/, '');
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  if (![...p.keys()].length) return null;
  const s: HistorySettings = { ...DEFAULT_SETTINGS };
  let loc: HistoryLocation | null = null;
  const ll = p.get('ll');
  if (ll) {
    const [lat, lon] = ll.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) loc = { name: p.get('n') ?? 'Ort', lat, lon, admin: p.get('a') ?? undefined };
  }
  const set = <K extends keyof HistorySettings>(k: K, v: HistorySettings[K] | undefined) => { if (v !== undefined) s[k] = v; };
  if (p.get('mo') === 'explore') s.mode = 'explore';
  const eg = p.get('eg'); if (eg === 'day' || eg === 'month' || eg === 'year') s.exploreGran = eg;
  const ed = p.get('ed'); if (ed) { const [ey, em, edd] = ed.split('.').map(Number); if (ey) s.exploreYear = ey; if (em) s.exploreMonth = em; if (edd) s.exploreDay = edd; }
  const v = p.get('v'); if (v) set('variable', v as VariableKey);
  const r = p.get('r'); if (r) set('resolution', r as Resolution);
  const per = p.get('p'); if (per) set('period', per as PeriodPreset);
  const cs = p.get('cs'); if (cs) { const [a, b] = cs.split('-').map(Number); if (a) s.customStart = a; if (b) s.customEnd = b; }
  const np = p.get('np'); if (np) s.normalPeriodId = np;
  const c = p.get('c'); if (c) set('chart', c as ChartType);
  const k = p.get('k'); if (k) set('kenntag', k as KenntagKey);
  const kt = p.get('kt'); if (kt != null && Number.isFinite(Number(kt))) s.kenntagThreshold = Number(kt);
  const m = p.get('m'); if (m) s.months = m.split('.').map(Number).filter((x) => x >= 1 && x <= 12);
  if (p.get('lbl') === '1') s.showLabels = true;
  if (p.get('tr') === '0') s.showTrend = false;
  const d = p.get('d'); if (d) { const [mo, da] = d.split('.').map(Number); if (mo) s.lookupMonth = mo; if (da) s.lookupDay = da; }
  const fy = p.get('fy'); if (fy && Number.isFinite(Number(fy))) s.focusYear = Number(fy);
  return { loc, settings: s };
}

// --- Favoriten / Zuletzt (US-1.5) -------------------------------------------

const FAV_KEY = 'buscosun.history.favorites.v1';
const RECENT_KEY = 'buscosun.history.recents.v1';

const readList = (key: string): HistoryLocation[] => { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; } };
const writeList = (key: string, list: HistoryLocation[]) => { try { localStorage.setItem(key, JSON.stringify(list.slice(0, 12))); } catch { /* ignore */ } };
const sameLoc = (a: HistoryLocation, b: HistoryLocation) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;

export const getFavorites = () => readList(FAV_KEY);
export const getRecents = () => readList(RECENT_KEY);
export function isFavorite(loc: HistoryLocation): boolean { return getFavorites().some((f) => sameLoc(f, loc)); }
export function toggleFavorite(loc: HistoryLocation): boolean {
  const list = getFavorites();
  const idx = list.findIndex((f) => sameLoc(f, loc));
  if (idx >= 0) { list.splice(idx, 1); writeList(FAV_KEY, list); return false; }
  list.unshift(loc); writeList(FAV_KEY, list); return true;
}
export function pushRecent(loc: HistoryLocation) {
  const list = getRecents().filter((r) => !sameLoc(r, loc));
  list.unshift(loc); writeList(RECENT_KEY, list);
}

// --- Fragen-Einstieg (E2) ----------------------------------------------------

export interface QuestionTile {
  id: string;
  question: string;
  tag: string;
  /** Teil-Zustand, der bei Auswahl gesetzt wird (US-2.1). */
  apply: Partial<HistorySettings>;
}

export const QUESTION_TILES: QuestionTile[] = [
  { id: 'summer-anomaly', question: 'Wie warm war der letzte Sommer im Vergleich zu normal?', tag: 'Temperatur · Anomalie', apply: { variable: 'tmean', resolution: 'yearly', chart: 'anomaly', period: 'all', showTrend: true } },
  { id: 'last-frost', question: 'Wann war der letzte Frost?', tag: 'Frosttage · Gärtnern', apply: { variable: 'tmin', chart: 'kenntage', kenntag: 'frost', resolution: 'yearly', period: 'all' } },
  { id: 'dry-date', question: 'Wie trocken ist mein Hochzeitsdatum historisch?', tag: 'Niederschlag · Datum', apply: { variable: 'precip', chart: 'dateLookup', period: 'all' } },
  { id: 'hot-days-trend', question: 'Wie viele Hitzetage pro Jahr inzwischen?', tag: 'Kenntage · Trend', apply: { variable: 'tmax', chart: 'kenntage', kenntag: 'hot', resolution: 'yearly', period: 'all' } },
  { id: 'stripes', question: 'Zeig mir die Klimastreifen für meinen Ort', tag: 'Warming Stripes', apply: { variable: 'tmean', chart: 'stripes', resolution: 'yearly', period: 'all' } },
  { id: 'birthday', question: 'Wie war das Wetter an meinem Geburtstag?', tag: 'Rückblick · Datum', apply: { chart: 'dateLookup', variable: 'tmax', period: 'all' } },
];

// --- Freitext-Interpretation (US-2.5) ---------------------------------------

export interface ParseResult {
  apply: Partial<HistorySettings>;
  /** Erkanntes wird zurückgemeldet; bei Unklarheit Optionen anbieten. */
  understood: string[];
  clarify?: { question: string; options: { label: string; apply: Partial<HistorySettings> }[] };
}

const MONTHS_DE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];

/** Einfaches, regelbasiertes Mapping „Frage in eigenen Worten" → Zustand. */
export function parseQuestion(text: string): ParseResult {
  const t = text.toLowerCase();
  const apply: Partial<HistorySettings> = {};
  const understood: string[] = [];

  // Variable
  if (/(regen|niederschlag|nass|trocken|dürre)/.test(t)) { apply.variable = 'precip'; understood.push('Niederschlag'); }
  else if (/(sonne|sonnig|sonnenstunden)/.test(t)) { apply.variable = 'sunshine'; understood.push('Sonnenstunden'); }
  else if (/(wind|sturm|böen)/.test(t)) { apply.variable = 'wind'; understood.push('Wind'); }
  else if (/(feucht|luftfeuchte)/.test(t)) { apply.variable = 'humidity'; understood.push('Luftfeuchte'); }
  else if (/(warm|wärmer|heiß|hitze|temperatur|kalt|kälter)/.test(t)) { apply.variable = 'tmean'; understood.push('Temperatur'); }

  // Kenntage
  if (/hitzetag|heiß/.test(t)) { apply.chart = 'kenntage'; apply.kenntag = 'hot'; apply.variable = 'tmax'; understood.push('Hitzetage'); }
  else if (/sommertag/.test(t)) { apply.chart = 'kenntage'; apply.kenntag = 'summer'; apply.variable = 'tmax'; understood.push('Sommertage'); }
  else if (/frost|frier/.test(t)) { apply.chart = 'kenntage'; apply.kenntag = 'frost'; apply.variable = 'tmin'; understood.push('Frosttage'); }
  else if (/tropennacht|tropennächte/.test(t)) { apply.chart = 'kenntage'; apply.kenntag = 'tropicalNight'; apply.variable = 'tmin'; understood.push('Tropennächte'); }

  // Anomalie / Vergleich zu normal
  if (/(im vergleich zu normal|zu warm|zu kalt|zu nass|anomalie|ungewöhnlich|abweichung)/.test(t)) { apply.chart = 'anomaly'; understood.push('Abweichung vom Normal'); }
  // Klimastreifen
  if (/(streifen|stripes|veränder|erwärm|klimawandel)/.test(t)) { apply.chart = 'stripes'; understood.push('Klimastreifen'); }
  // Trend
  if (/(trend|entwicklung|inzwischen|immer mehr)/.test(t)) { apply.showTrend = true; understood.push('Trend'); }

  // Konkretes Datum (Tag. Monat oder „14. juli")
  const mDate = t.match(/(\d{1,2})\.?\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)/);
  if (mDate) {
    const day = Number(mDate[1]); const month = MONTHS_DE.indexOf(mDate[2]) + 1;
    apply.chart = 'dateLookup'; apply.lookupMonth = month; apply.lookupDay = day;
    understood.push(`Datum ${day}. ${MONTHS_DE[month - 1]}`);
  }
  // Monatsname allein → Monatsfilter
  else {
    const mi = MONTHS_DE.findIndex((m) => new RegExp(`\\b${m}\\b`).test(t));
    if (mi >= 0) { apply.months = [mi + 1]; understood.push(`Monat ${MONTHS_DE[mi]}`); }
  }

  // Bei gar keiner Variable und keinem Diagramm → Rückfrage (US-2.5)
  let clarify: ParseResult['clarify'];
  if (!understood.length) {
    clarify = {
      question: 'Worum geht es? Wähle, was am ehesten passt:',
      options: [
        { label: 'Temperatur-Entwicklung', apply: { variable: 'tmean', chart: 'stripes' } },
        { label: 'Niederschlag / trocken', apply: { variable: 'precip', chart: 'anomaly' } },
        { label: 'Hitzetage zählen', apply: { variable: 'tmax', chart: 'kenntage', kenntag: 'hot' } },
        { label: 'Wetter an einem Datum', apply: { chart: 'dateLookup' } },
      ],
    };
  }
  return { apply, understood, clarify };
}
