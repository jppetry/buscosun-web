/**
 * Phase WT — page logic of the water temperature (`audit/seewetter-wassertemperatur.md`): what the card says about the
 * model and about the measurement, and the user's own threshold. Pure (contract `seaWaterTemp.ts`, the link's form from
 * `seaState.ts`), so the card, the chart and `verify:sea-watertemp` share one set of rules.
 *
 * What this file never does: it never fills a gap, never lets the model stand in for a measurement (or the other way
 * round), and it gives no advice — a threshold is the user's number, the sentences only say on which side a value lies.
 */
import { SEA_WT_RE } from './seaState';
import {
  SEA_WT_STALE_MS, WT_STATION_MAX_KM, wtEntryProblems, wtEntryStale, wtLatest, wtModelAt, wtModelEnd, wtStationOf,
  type SeaWtDoc, type SeaWtEntry, type WtCatalog, type WtModelPoint, type WtPoint, type WtStation,
} from './seaWaterTemp';

const H = 3_600_000;
const de1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** `7,2` — always one decimal, German comma, a real minus sign. */
export const wtNum = (c: number): string => de1.format(Math.abs(c) < 0.05 ? 0 : c).replace('-', '−');
/** A threshold is written as the user typed it: `18` stays `18`, `12.5` reads `12,5`. */
export const wtThNum = (c: number): string => (Number.isInteger(c) ? String(c).replace('-', '−') : wtNum(c));
const WHEN = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', hour12: false, timeZone: 'Europe/Berlin' });
/** `Do 14 Uhr` (Europe/Berlin). */
export const wtWhen = (t: number): string => `${WHEN.format(new Date(t)).replace('.,', '').replace(',', '').replace(' Uhr', '')} Uhr`;
const WHEN_MIN = new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Berlin' });
/** `Do 14:20 Uhr` — a measurement is named with its minute. */
export const wtWhenMin = (t: number): string => `${WHEN_MIN.format(new Date(t)).replace('.,', '').replace(',', '').replace(' Uhr', '')} Uhr`;

// --- Threshold (E-WT-6) ------------------------------------------------------------------------------------------

export type WtSide = 'over' | 'under';
export const WT_SIDES: readonly WtSide[] = ['over', 'under'];
export const WT_SIDE_LABEL: Readonly<Record<WtSide, string>> = Object.freeze({ over: 'über', under: 'unter' });
/** Degrees the control accepts (`set`: the value lock of the data is −2.5 … 32 °C). */
export const WT_TH_RANGE_C: readonly [number, number] = [-2, 35];
export interface WtThreshold { side: WtSide; /** °C, at most one decimal. */ c: number }
export const isWtThreshold = (v: unknown): v is WtThreshold => {
  const o = v as WtThreshold | null;
  return !!o && typeof o === 'object' && WT_SIDES.includes(o.side) && typeof o.c === 'number' && Number.isFinite(o.c)
    && o.c >= WT_TH_RANGE_C[0] && o.c <= WT_TH_RANGE_C[1] && Math.abs(o.c * 10 - Math.round(o.c * 10)) < 1e-9;
};
/** „über 18 °C“ / „unter 12,5 °C“. */
export const wtThresholdText = (th: WtThreshold): string => `${WT_SIDE_LABEL[th.side]} ${wtThNum(th.c)} °C`;
/** Strictly on the named side: a value exactly on the threshold lies on neither. */
export const wtOnSide = (c: number, th: WtThreshold): boolean => (th.side === 'over' ? c > th.c : c < th.c);

/** `wt=over.18` — the threshold travels in the share link like the tide window's `tw`. */
export const encodeWtParam = (th: WtThreshold): string | null => (isWtThreshold(th) ? `${th.side}.${th.c}` : null);
export function parseWtParam(v: string | null | undefined): WtThreshold | null {
  const m = v ? SEA_WT_RE.exec(v) : null;
  if (!m) return null;
  const th = { side: m[1] as WtSide, c: Number(m[2]) };
  return isWtThreshold(th) ? th : null;
}
/** What the user typed („18“, „12,5“, „−1“) → °C, or `null` when it is not a number of the accepted form and range. */
export function parseWtInput(raw: string): number | null {
  const s = raw.trim().replace('−', '-').replace(',', '.');
  if (!/^-?\d{1,2}(\.\d)?$/.test(s)) return null;
  const c = Number(s);
  return c >= WT_TH_RANGE_C[0] && c <= WT_TH_RANGE_C[1] ? c : null;
}

export const WT_STORAGE_KEY = 'sea.wtemp.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => (typeof localStorage !== 'undefined' ? localStorage : null);
/** ONE stored threshold for all spots: it is the user's number, not a property of a place. */
export function loadWtThreshold(storage: Pick<Storage, 'getItem'> | null = defaultStore()): WtThreshold | null {
  try {
    const o = JSON.parse(storage?.getItem(WT_STORAGE_KEY) ?? 'null');
    return isWtThreshold(o) ? { side: o.side, c: o.c } : null;
  } catch { return null; }
}
export function saveWtThreshold(th: WtThreshold | null, storage: Store | null = defaultStore()): void {
  try { storage?.setItem(WT_STORAGE_KEY, JSON.stringify(th && isWtThreshold(th) ? { side: th.side, c: th.c } : null)); } catch { /* private mode: the threshold holds for this page view and travels in the link */ }
}

// --- Model at the spot -----------------------------------------------------------------------------------------

/** What the page knows about the model file: the document, or why there is none. */
export interface WtModelLoad { doc: SeaWtDoc | null; state: 'ok' | 'none' | 'error'; why: string | null }
export const WT_WHY = Object.freeze({
  noFile: 'Im Datenspeicher liegt noch keine Datei mit der Wassertemperatur des DMI-Modells.',
  unreadable: 'Die Datei mit der Wassertemperatur des DMI-Modells ist nicht lesbar (unerwartete Form).',
  net: 'Die Datei mit der Wassertemperatur des DMI-Modells ist gerade nicht erreichbar.',
  killed: 'Die Seewetter-Daten sind gerade abgeschaltet.',
  noPoint: 'Für diesen Spot liegt kein Gitterpunkt des DMI-Modells mit Wasser in der Nähe.',
  stale: `Der letzte Lauf des DMI-Modells für diesen Punkt begann vor mehr als ${SEA_WT_STALE_MS / H} Stunden und wird nicht mehr gezeigt.`,
});

export type WtGap = 'dry' | 'before' | 'beyond';
export interface WtModelView {
  state: 'loading' | 'ok' | 'none';
  /** `none`: the reason, in the page's words (with DMI's own where the producer recorded them). */
  why: string | null;
  entry: SeaWtEntry | null;
  /** The catalogue's point (also when there is no entry), for the facts line. */
  point: WtModelPoint | null;
  /** °C of the chosen hour, or `null` with `gap`. */
  c: number | null;
  gap: WtGap | null;
  /** Start of the DKSS run and last hour with a value. */
  runMs: number | null; until: number | null;
}

/**
 * The model for ONE spot at the chosen hour. A spot without a point in the catalogue, a missing or unreadable file, an
 * entry outside the value lock, a failed request and a run older than `SEA_WT_STALE_MS` are all "keine Daten" with
 * their reason — never an older value. Pure.
 */
export function wtModelViewOf(a: { load: WtModelLoad | 'loading'; catalog: WtCatalog | null; spotId: string; tMs: number; nowMs: number }): WtModelView {
  const point = a.catalog?.spots[a.spotId]?.model ?? null;
  const none = (why: string): WtModelView => ({ state: 'none', why, entry: null, point, c: null, gap: null, runMs: null, until: null });
  if (a.load === 'loading') return { state: 'loading', why: null, entry: null, point, c: null, gap: null, runMs: null, until: null };
  if (!point) return none(WT_WHY.noPoint);
  if (!a.load.doc) return none(a.load.why ?? WT_WHY.noFile);
  const e = a.load.doc.spots[a.spotId];
  if (!e) {
    const f = a.load.doc.failed.find((x) => x.id === a.spotId);
    return none(`Das DMI hat für diesen Punkt beim letzten Abruf nichts geliefert${f ? ` („${f.error}“)` : ''}.`);
  }
  if (wtEntryProblems(a.spotId, e).length) return none(WT_WHY.unreadable);
  if (wtEntryStale(e, a.nowMs)) return none(WT_WHY.stale);
  const until = wtModelEnd(e), hour = Math.floor(a.tMs / H) * H;
  const c = wtModelAt(e, a.tMs);
  const gap: WtGap | null = c != null ? null : hour < e.t0 ? 'before' : until != null && hour > until ? 'beyond' : 'dry';
  return { state: 'ok', why: null, entry: e, point, c, gap, runMs: e.t0, until };
}

// --- Measurement near the spot -----------------------------------------------------------------------------------

/** What the page read from the station: its points (ascending, °C), or why not. */
export interface WtObsLoad { points: WtPoint[] | null; state: 'ok' | 'error' }
export interface WtObsView {
  state: 'loading' | 'ok' | 'none' | 'nostation';
  station: WtStation | null; km: number | null;
  /** The newest value not older than `WT_OBS_MAX_AGE_MS`. */
  latest: WtPoint | null;
  /** Newest value at all (also an old one) — only to SAY how old the last reading is, never shown as the current value. */
  last: WtPoint | null;
  why: string | null;
}
export const WT_NO_STATION = `Im Umkreis von ${WT_STATION_MAX_KM} km misst keine Station der WSV oder des DMI die Wassertemperatur. Das Modell steht nicht an ihrer Stelle.`;

/** The measurement for ONE spot: the catalogue's station (≤ `WT_STATION_MAX_KM`), its newest fresh value — or nothing. Pure. */
export function wtObsViewOf(a: { load: WtObsLoad | 'loading' | null; catalog: WtCatalog | null; spotId: string; nowMs: number }): WtObsView {
  const near = a.catalog?.spots[a.spotId]?.station ?? null;
  const station = near && a.catalog ? wtStationOf(a.catalog, near.key) : null;
  if (!near || !station || !(near.km <= WT_STATION_MAX_KM)) return { state: 'nostation', station: null, km: null, latest: null, last: null, why: WT_NO_STATION };
  const base = { station, km: near.km };
  if (a.load === 'loading' || a.load == null) return { ...base, state: 'loading', latest: null, last: null, why: null };
  if (!a.load.points) return { ...base, state: 'none', latest: null, last: null, why: 'Die Station ist gerade nicht lesbar.' };
  const past = a.load.points.filter((p) => p.t <= a.nowMs + 10 * 60_000);
  const last = past.length ? past[past.length - 1] : null;
  const latest = wtLatest(a.load.points, a.nowMs);
  if (latest) return { ...base, state: 'ok', latest, last, why: null };
  return { ...base, state: 'none', latest: null, last, why: last ? `Der letzte Wert der Station ist von ${wtWhenMin(last.t)} — älter als zwei Stunden und deshalb nicht als aktueller Wert gezeigt.` : 'Die Station hat in den letzten Tagen keinen Wert geliefert.' };
}

// --- Threshold against the model and the measurement -------------------------------------------------------------

export interface WtWindow { from: number; /** End of the last hour of the run (exclusive). */ to: number }
/**
 * Runs of consecutive whole hours from `fromMs` on in which the model lies on the threshold's side. An hour without a
 * value ends a run (a gap is never bridged). Pure.
 */
export function wtWindows(e: SeaWtEntry, th: WtThreshold, fromMs: number): WtWindow[] {
  const out: WtWindow[] = [];
  let start: number | null = null;
  const first = Math.max(0, Math.ceil((Math.floor(fromMs / H) * H - e.t0) / H));
  for (let i = first; i <= e.c.length; i++) {
    const x = i < e.c.length ? e.c[i] : null;
    const on = x != null && wtOnSide(x / 10, th);
    if (on && start == null) start = e.t0 + i * H;
    if (!on && start != null) { out.push({ from: start, to: e.t0 + i * H }); start = null; }
  }
  return out;
}
export const wtWindowLabel = (w: WtWindow): string => `${wtWhen(w.from)} bis ${wtWhen(w.to)}`;

/** The neutral sentence about the model (no advice): where it lies against the user's number until the run ends. */
export function wtModelSentence(e: SeaWtEntry, th: WtThreshold, nowMs: number): string {
  const until = wtModelEnd(e);
  const ws = wtWindows(e, th, nowMs);
  const side = wtThresholdText(th);
  if (until == null || until < Math.floor(nowMs / H) * H) return `Der Lauf des Modells reicht nicht mehr bis jetzt — keine Aussage zu „${side}“.`;
  if (!ws.length) return `Bis ${wtWhen(until)} liegt das Modell zu keiner Stunde ${side}.`;
  const from = Math.max(Math.floor(nowMs / H) * H, e.t0);
  const gaps = e.c.slice(Math.max(0, (from - e.t0) / H)).some((x) => x == null);
  if (ws.length === 1 && ws[0].from <= from && ws[0].to >= until + H && !gaps) return `Bis ${wtWhen(until)} liegt das Modell in jeder Stunde ${side}.`;
  return `Das Modell liegt ${side}: ${ws.map(wtWindowLabel).join(' · ')}.`;
}
/** The neutral sentence about the newest measurement. */
export function wtObsSentence(p: WtPoint, th: WtThreshold): string {
  const rel = p.c > th.c ? 'über' : p.c < th.c ? 'unter' : 'genau auf';
  return `Die letzte Messung (${wtNum(p.c)} °C, ${wtWhenMin(p.t)}) liegt ${rel} deiner Schwelle von ${wtThNum(th.c)} °C.`;
}
