/**
 * GL-5 — contract of the change feed "Was sich verändert hat": one document per ISO week (`feed/<year>-W<week>.json`), events with a STABLE id (the same
 * event keeps its id across runs and rebuilds), every event with origin, source and time. DOM-free; the producer (`scripts/glacier/feed.mjs`), the verifier
 * and the page share it.
 *
 * Honesty rules encoded here (plan §10): official events carry the authority's sentence VERBATIM (equal to the curated `official.json` item, never a summary),
 * a model event is never `measured`, a satellite event names its scene, "verschwunden" (status) only with the authority's own criterion, and no event
 * text uses the tour words or gives a melt number with a unit while the calibration gate is red.
 */
import { GLACIER_ORIGINS, glacierForbiddenWords, type GlacierOrigin, type GlacierOfficialItem } from './glacierContract';

export const GLACIER_FEED_TYPES = ['snowline', 'heat', 'newsnow', 'official', 'status'] as const;
export type GlacierFeedType = (typeof GLACIER_FEED_TYPES)[number];
export const GLACIER_FEED_WEEK_RE = /^\d{4}-W\d{2}$/;
export const GLACIER_FEED_ID_RE = /^ev_(snowline|heat|newsnow|official|status)_[a-z0-9-]+_\d{4}-\d{2}-\d{2}$/;
export const glacierFeedPath = (week: string) => `feed/${week}.json`;
export const glacierCardPath = (week: string) => `card/${week}.png`;
/** Weeks kept in the data repo. */
export const GLACIER_FEED_KEEP_WEEKS = 12;
/** Origin an event type may carry — a satellite event is never "model", a model event never "measured". */
export const GLACIER_FEED_ORIGIN: Readonly<Record<GlacierFeedType, GlacierOrigin>> = Object.freeze({ snowline: 'satellite', newsnow: 'satellite', heat: 'model', official: 'official', status: 'official' });
/** Snow-line change that makes a scene an event (plan §10), in metres. */
export const GLACIER_FEED_SNOWLINE_STEP_M = 100;
/** A hot day: freezing level above the glacier's median elevation AND melt index p50 at least this (`set`). */
export const GLACIER_FEED_HEAT_INDEX = 60;
export const GLACIER_FEED_MAX_HEAT = 5;

export interface GlacierFeedEvent {
  id: string;
  type: GlacierFeedType;
  /** ISO date `YYYY-MM-DD` of the scene, the run day or the report. */
  at: string;
  /** Glacier id, or `null` for a country-wide report. */
  glacier: string | null;
  origin: GlacierOrigin;
  text: string;
  source: string;
  url?: string;
  /** The authority's sentence, verbatim — official and status events only. */
  quote?: string;
  /** Sort weight for the weekly card (higher = more important); not shown. */
  w: number;
}
export interface GlacierFeedDoc { schema: 1; kind: 'glacier/feed'; week: string; builtAt: string; events: GlacierFeedEvent[]; top: string[] }

/** ISO week (year, number) of a date, weeks start on Monday. */
export function isoWeekOf(ms: number): { year: number; week: number; monday: number } {
  const d = new Date(Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate()));
  const day = d.getUTCDay() || 7;
  const monday = d.getTime() - (day - 1) * 86_400_000;
  const thursday = new Date(monday + 3 * 86_400_000);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1;
  return { year, week, monday };
}
export const isoWeekKey = (ms: number): string => { const w = isoWeekOf(ms); return `${w.year}-W${String(w.week).padStart(2, '0')}`; };
/** The week before `ms`'s week. */
export const previousWeekKey = (ms: number): string => isoWeekKey(isoWeekOf(ms).monday - 3_600_000);

export function feedProblems(doc: GlacierFeedDoc, official: readonly GlacierOfficialItem[], glacierIds?: ReadonlySet<string>): string[] {
  const p: string[] = [];
  if (doc?.kind !== 'glacier/feed' || doc.schema !== 1) return ['kind/schema'];
  if (!GLACIER_FEED_WEEK_RE.test(doc.week)) p.push(`Woche ${doc.week}`);
  const ids = new Set<string>();
  const byQuote = new Map(official.map((o) => [o.quote, o]));
  for (const e of doc.events ?? []) {
    if (!GLACIER_FEED_ID_RE.test(e.id)) p.push(`${e.id}: Kennung`);
    if (ids.has(e.id)) p.push(`${e.id}: doppelt`);
    ids.add(e.id);
    if (!GLACIER_FEED_TYPES.includes(e.type)) p.push(`${e.id}: Typ ${e.type}`);
    if (!e.id.startsWith(`ev_${e.type}_`)) p.push(`${e.id}: Kennung passt nicht zum Typ ${e.type}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.at) || !e.id.endsWith(`_${e.at}`)) p.push(`${e.id}: Datum ${e.at}`);
    if (!GLACIER_ORIGINS.includes(e.origin)) p.push(`${e.id}: Herkunft ${e.origin}`);
    else if (e.origin !== GLACIER_FEED_ORIGIN[e.type]) p.push(`${e.id}: Herkunft ${e.origin} bei Typ ${e.type}`);
    if (!e.text || !e.source) p.push(`${e.id}: Text oder Quelle fehlt`);
    if (glacierForbiddenWords(e.text).length) p.push(`${e.id}: Wort ${glacierForbiddenWords(e.text).join(',')}`);
    if (e.glacier && glacierIds && !glacierIds.has(e.glacier)) p.push(`${e.id}: Gletscher ${e.glacier} nicht im Katalog`);
    if (e.type === 'heat' && /\bmm\b|cm Eis|m³/.test(e.text)) p.push(`${e.id}: Schmelze mit Einheit (Gate C nicht bestanden)`);
    if (e.type === 'official' || e.type === 'status') {
      const o = e.quote ? byQuote.get(e.quote) : null;
      if (!e.quote) p.push(`${e.id}: amtliches Ereignis ohne wörtlichen Satz`);
      else if (!o) p.push(`${e.id}: Satz nicht wörtlich aus official.json`);
      else if (e.type === 'status' && !o.criterion) p.push(`${e.id}: Statusverlust ohne Kriterium der Behörde`);
      if (!e.url) p.push(`${e.id}: Quelle ohne Link`);
    } else if (e.quote != null) p.push(`${e.id}: Zitat bei Typ ${e.type}`);
  }
  for (const t of doc.top ?? []) if (!ids.has(t)) p.push(`top ${t}: kein Ereignis`);
  if ((doc.top ?? []).length > 3) p.push('top: mehr als drei');
  return p;
}
