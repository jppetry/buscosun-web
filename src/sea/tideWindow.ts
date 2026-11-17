/**
 * Phase TF — tide windows (`audit/tidenfenster.md`): time windows in which the water level curve of ONE BSH gauge
 * lies on the allowed side of the user's own threshold. Pure and dependency-free (types and the distance helper of
 * `waterLevel.ts` only), so the page, the chart, the hourly band and `verify:sea-tide-window` share one set of rules.
 *
 * What this file never does: it never moves a height from one gauge to another, never fills a gap in the curve and
 * never says anything about water depth, a fairway or suitability. A threshold is the user's number at a gauge;
 * the words are "über deiner Schwelle am Pegel X" / "unter deiner Schwelle am Pegel X".
 *
 * References (E-TF-2, E-WL-9): the curve is delivered in cm above gauge zero. A threshold may be given against gauge
 * zero, NHN, chart datum or the gauge's mean high water — each a height the BSH delivers for the SAME gauge. Compared is
 * "curve value − reference height" against the user's number: a subtraction, nothing else.
 */
import type { SeaVerdict } from './seaProfiles';
import { SEA_TW_RE } from './seaState';
import type { WlCurvePoint, WlRegion } from './waterLevel';

// --- Threshold ------------------------------------------------------------------------------------

export type TideMode = 'min' | 'max';
export type TideRef = 'pnp' | 'nhn' | 'skn' | 'mhw';
export const TIDE_MODES: readonly TideMode[] = ['min', 'max'];
export const TIDE_REFS: readonly TideRef[] = ['pnp', 'nhn', 'skn', 'mhw'];
export const TIDE_MODE_LABEL: Record<TideMode, string> = { min: 'mindestens', max: 'höchstens' };

export interface TideThreshold { mode: TideMode; /** Whole centimetres against `ref`; may be negative. */ cm: number; ref: TideRef }

/** Centimetres the control accepts (four digits cover every gauge: the curve lies between 0 and ≈ 1 100 cm). */
export const TIDE_CM_MAX = 2000;
const validCm = (cm: unknown): cm is number => typeof cm === 'number' && Number.isInteger(cm) && Math.abs(cm) <= TIDE_CM_MAX;
export const isTideThreshold = (v: unknown): v is TideThreshold => {
  const o = v as TideThreshold | null;
  return !!o && typeof o === 'object' && TIDE_MODES.includes(o.mode) && TIDE_REFS.includes(o.ref) && validCm(o.cm);
};

/** A reference height the gauge itself carries. `offsetCm` = where that reference lies, cm above gauge zero. */
export interface TideRefInfo { ref: TideRef; /** Short word for the control and the chart. */ label: string; /** The word in a sentence: "über Pegelnull". */ over: string; offsetCm: number }

export interface TideGaugeRefs { region: WlRegion; zeroNhnCm: number | null; chartDatumCm: number | null; mhwCm: number | null; mlwCm: number | null }

/**
 * The references this gauge offers. Gauge zero always; NHN and chart datum only with a delivered height other than 0
 * (three gauges carry 0 as a placeholder — V-WL-7 — and "gauge zero lies on NHN" would be an invention); mean high
 * water only as a real pair (0/0 is the same placeholder). The Baltic has no tide: its word is MHW, not MThw.
 */
export function tideRefs(g: TideGaugeRefs): TideRefInfo[] {
  const out: TideRefInfo[] = [{ ref: 'pnp', label: 'Pegelnull', over: 'Pegelnull', offsetCm: 0 }];
  if (g.zeroNhnCm != null && g.zeroNhnCm !== 0) out.push({ ref: 'nhn', label: 'NHN', over: 'NHN', offsetCm: -g.zeroNhnCm });
  if (g.chartDatumCm != null && g.chartDatumCm !== 0) out.push({ ref: 'skn', label: 'Seekartennull', over: 'Seekartennull', offsetCm: g.chartDatumCm });
  const placeholder = g.mhwCm === 0 && g.mlwCm === 0;
  if (g.mhwCm != null && !placeholder) {
    const word = g.region === 'baltic_sea' ? 'MHW' : 'MThw';
    out.push({ ref: 'mhw', label: word, over: `${word} dieses Pegels`, offsetCm: g.mhwCm });
  }
  return out;
}

/** The reference of a threshold at this gauge, or null when the gauge does not carry it (then there are no windows). */
export const tideRefOf = (refs: readonly TideRefInfo[], ref: TideRef): TideRefInfo | null => refs.find((r) => r.ref === ref) ?? null;

/** "mindestens 550 cm über Pegelnull" — negative numbers read "20 cm unter NHN". */
export function tideThresholdText(th: TideThreshold, info: TideRefInfo): string {
  const side = th.cm < 0 ? 'unter' : 'über';
  return `${TIDE_MODE_LABEL[th.mode]} ${Math.abs(th.cm).toLocaleString('de-DE')} cm ${side} ${info.over}`;
}

/** The side of the threshold a window lies on, as the sentence fragment of the brief. */
export const tideSideText = (mode: TideMode, gaugeName: string): string =>
  `${mode === 'min' ? 'über' : 'unter'} deiner Schwelle am Pegel ${gaugeName}`;

// --- Share link and local storage (E-TF-2/3) --------------------------------------------------------

const GAUGE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** `tw=min.550.pnp.cuxhaven_steubenhoeft` — the gauge is part of the link: a threshold belongs to one gauge. */
export function encodeTideParam(th: TideThreshold, gaugeId: string): string | null {
  return isTideThreshold(th) && GAUGE_ID_RE.test(gaugeId) ? `${th.mode}.${th.cm}.${th.ref}.${gaugeId}` : null;
}
export function parseTideParam(v: string | null | undefined): { threshold: TideThreshold; gaugeId: string } | null {
  const m = v ? SEA_TW_RE.exec(v) : null;
  if (!m) return null;
  const threshold = { mode: m[1] as TideMode, cm: Number(m[2]), ref: m[3] as TideRef };
  return isTideThreshold(threshold) ? { threshold, gaugeId: m[4] } : null;
}

export const TIDE_STORAGE_KEY = 'sea.tide.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStore = (): Store | null => (typeof localStorage !== 'undefined' ? localStorage : null);

/** The stored threshold of ONE gauge (550 cm above gauge zero in Cuxhaven mean nothing in Kiel). */
export function loadTideThreshold(gaugeId: string, storage: Pick<Storage, 'getItem'> | null = defaultStore()): TideThreshold | null {
  try {
    const all = JSON.parse(storage?.getItem(TIDE_STORAGE_KEY) ?? '{}');
    const o = all?.[gaugeId];
    return isTideThreshold(o) ? { mode: o.mode, cm: o.cm, ref: o.ref } : null;
  } catch { return null; }
}
export function saveTideThreshold(gaugeId: string, th: TideThreshold | null, storage: Store | null = defaultStore()): void {
  try {
    const all = JSON.parse(storage?.getItem(TIDE_STORAGE_KEY) ?? '{}') ?? {};
    if (th && isTideThreshold(th)) all[gaugeId] = { mode: th.mode, cm: th.cm, ref: th.ref }; else delete all[gaugeId];
    storage?.setItem(TIDE_STORAGE_KEY, JSON.stringify(all));
  } catch { /* private mode: the threshold holds for this page view and travels in the link */ }
}

// --- The series the windows are read from (E-TF-4) --------------------------------------------------

export type TideSrc = 'measured' | 'forecast' | 'tide';
export interface TidePoint { t: number; /** cm above gauge zero, as delivered. */ cm: number; src: TideSrc }
export interface TideSeries {
  points: TidePoint[];
  /** Last instant with a measurement or a model value; beyond it only the tidal prediction speaks. */
  curveEnd: number | null;
  /** Last instant of the whole series. */
  end: number | null;
}

/**
 * Measurement and model curve where the service carries them (the model value wins where both stand); BEYOND their
 * last instant the tidal prediction, marked as such. The tidal prediction is never used to bridge a hole inside the
 * model curve — astronomy without the wind surge is a different quantity, it only speaks where nothing else does.
 */
export function tideSeries(curve: readonly WlCurvePoint[]): TideSeries {
  let curveEnd: number | null = null;
  for (const p of curve) if ((p.forecast != null || p.measured != null) && (curveEnd == null || p.t > curveEnd)) curveEnd = p.t;
  const points: TidePoint[] = [];
  for (const p of curve) {
    if (p.forecast != null) points.push({ t: p.t, cm: p.forecast, src: 'forecast' });
    else if (p.measured != null) points.push({ t: p.t, cm: p.measured, src: 'measured' });
    else if (p.tide != null && (curveEnd == null || p.t > curveEnd)) points.push({ t: p.t, cm: p.tide, src: 'tide' });
  }
  points.sort((a, b) => a.t - b.t);
  return { points, curveEnd, end: points.length ? points[points.length - 1].t : null };
}

/** Two neighbouring points further apart than this are not joined (the service steps 4–15 min). */
export const TIDE_MAX_GAP_MS = 45 * 60_000;

interface Run { from: number; to: number; tideOnly: boolean; points: TidePoint[] }
/** Unbroken stretches of ONE source class (curve resp. tidal prediction). */
function runs(points: readonly TidePoint[], maxGapMs: number): Run[] {
  const out: Run[] = [];
  let cur: Run | null = null;
  for (const p of points) {
    const tideOnly = p.src === 'tide';
    if (cur && cur.tideOnly === tideOnly && p.t - cur.to <= maxGapMs) { cur.points.push(p); cur.to = p.t; continue; }
    cur = { from: p.t, to: p.t, tideOnly, points: [p] };
    out.push(cur);
  }
  return out;
}

/** Signed distance to the threshold, cm: ≥ 0 = on the allowed side. `offsetCm` = height of the reference above gauge zero. */
export const tideMarginCm = (cm: number, th: TideThreshold, offsetCm: number): number =>
  (th.mode === 'min' ? (cm - offsetCm) - th.cm : th.cm - (cm - offsetCm));

export interface TideWindow {
  from: number; to: number;
  /** Read from the tidal prediction, beyond the end of measurement and model curve. */
  tideOnly: boolean;
  /** The window does not begin with a crossing: it was already open at `from` (now, or the start of its source). */
  openStart: boolean;
  /** The window does not end with a crossing: its source ends there. */
  openEnd: boolean;
}

/**
 * Windows on the allowed side of the threshold. A crossing between two neighbouring points of the same gauge is
 * placed linearly in time between them. `fromMs` clips to "from now on".
 */
export function tideWindows(points: readonly TidePoint[], th: TideThreshold, offsetCm: number, fromMs = -Infinity, maxGapMs = TIDE_MAX_GAP_MS): TideWindow[] {
  const out: TideWindow[] = [];
  for (const run of runs(points, maxGapMs)) {
    let start: number | null = null, openStart = false;
    const close = (to: number, openEnd: boolean) => {
      if (start == null) return;
      if (to > fromMs && to > start) out.push({ from: Math.max(start, fromMs), to, tideOnly: run.tideOnly, openStart: openStart || start < fromMs, openEnd });
      start = null;
    };
    run.points.forEach((p, i) => {
      const m = tideMarginCm(p.cm, th, offsetCm);
      if (i === 0) { if (m >= 0) { start = p.t; openStart = true; } return; }
      const q = run.points[i - 1], mq = tideMarginCm(q.cm, th, offsetCm);
      if ((mq >= 0) === (m >= 0)) return;
      const cross = q.t + ((p.t - q.t) * mq) / (mq - m);
      if (m >= 0) { start = cross; openStart = false; } else close(cross, false);
    });
    close(run.to, true);
  }
  return out;
}

// --- Per hour (hourly band and the classes, E-TF-5) -------------------------------------------------

export type TideHourState = 'in' | 'part' | 'out' | 'none';
export interface TideHour {
  /** `in` = the whole hour on the allowed side, `part` = some of it, `out` = none of it, `none` = no curve for this hour. */
  state: TideHourState;
  tideOnly: boolean;
  /** Smallest distance to the threshold among the points in [t, t + 1 h), cm (≥ 0 = allowed side); null without a point. */
  marginCm: number | null;
}

const HOUR_MS = 3_600_000;
/** An hour counts as covered when the curve misses at most this much of it (steps of up to 15 min at both ends). */
export const TIDE_HOUR_SLACK_MS = 15 * 60_000;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** One entry per hour start: where the hour [t, t + 1 h) stands against the threshold. */
export function tideHours(points: readonly TidePoint[], th: TideThreshold, offsetCm: number, hourStarts: readonly number[], maxGapMs = TIDE_MAX_GAP_MS): TideHour[] {
  const rs = runs(points, maxGapMs);
  const ws = tideWindows(points, th, offsetCm, -Infinity, maxGapMs);
  return hourStarts.map((t) => {
    const t1 = t + HOUR_MS;
    let covered = 0, coveredTide = 0, inside = 0;
    for (const r of rs) { const o = overlap(t, t1, r.from, r.to); covered += o; if (r.tideOnly) coveredTide += o; }
    if (covered < HOUR_MS - TIDE_HOUR_SLACK_MS) return { state: 'none', tideOnly: false, marginCm: null };
    for (const w of ws) inside += overlap(t, t1, w.from, w.to);
    let marginCm: number | null = null;
    for (const p of points) {
      if (p.t < t) continue;
      if (p.t >= t1) break;
      const m = tideMarginCm(p.cm, th, offsetCm);
      if (marginCm == null || m < marginCm) marginCm = m;
    }
    // One second of slack for the arithmetic of the crossing times, no more: 36 s below the threshold is "part".
    const state: TideHourState = inside >= covered - 1000 ? 'in' : inside <= 1000 ? 'out' : 'part';
    return { state, tideOnly: coveredTide > 0, marginCm };
  });
}

/**
 * E-TF-5: an hour on the allowed side but closer than this to the threshold is "knapp". SET, not measured — the order
 * of magnitude of the uncertainty the BSH states at its official high/low water heights; the control names it as set.
 */
export const TIDE_TIGHT_CM = 10;

/**
 * Adds the water level to a profile verdict — called ONLY with a threshold set. Same precedence as `classify`:
 * outside beats missing beats tight. `h` undefined or `none` = no curve for the hour ⇒ "keine Daten", never "außerhalb".
 */
export function tideVerdict(v: SeaVerdict, h: TideHour | undefined, mode: TideMode, gaugeName: string): SeaVerdict {
  const at = `am Pegel ${gaugeName}`;
  const tide = h?.tideOnly ? ' (nur Gezeit)' : '';
  let kind: 'out' | 'missing' | 'tight' | 'ok', reason = '';
  if (!h || h.state === 'none') { kind = 'missing'; reason = `Wasserstand ${at} fehlt`; }
  else if (h.state === 'out') { kind = 'out'; reason = `Wasserstand ${mode === 'min' ? 'unter' : 'über'} deiner Schwelle ${at}${tide}`; }
  else if (h.state === 'part') { kind = 'tight'; reason = `Wasserstand nur einen Teil der Stunde ${mode === 'min' ? 'über' : 'unter'} deiner Schwelle ${at}${tide}`; }
  else if (h.marginCm != null && h.marginCm < TIDE_TIGHT_CM) { kind = 'tight'; reason = `Wasserstand nur ${Math.max(0, Math.round(h.marginCm))} cm ${mode === 'min' ? 'über' : 'unter'} deiner Schwelle ${at}${tide}`; }
  else kind = 'ok';

  if (v.cls === 'ausserhalb') return kind === 'out' ? { ...v, reasons: [...v.reasons, reason] } : v;
  if (kind === 'out') return { ...v, cls: 'ausserhalb', reasons: [reason] };
  if (v.cls === 'keine') return kind === 'missing' ? { ...v, reasons: [...v.reasons, reason] } : v;
  if (kind === 'missing') return { ...v, cls: 'keine', reasons: [reason] };
  if (v.cls === 'knapp') return kind === 'tight' ? { ...v, reasons: [...v.reasons, reason] } : v;
  if (kind === 'tight') return { ...v, cls: 'knapp', reasons: [reason] };
  return v;
}

// --- Deviation from the tide (E-TF-6) ---------------------------------------------------------------

/** Model curve minus tidal prediction at one curve point, cm — OUR subtraction, the service does not deliver it at the curve. */
export const tideDeviationCm = (p: WlCurvePoint | null): number | null =>
  (p && p.forecast != null && p.tide != null ? p.forecast - p.tide : null);
export const TIDE_DEVIATION_LABEL = 'Abweichung von der Gezeit (eigene Rechnung)';

// --- Words for a window -----------------------------------------------------------------------------

const DAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'Europe/Berlin' });
const HM = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Berlin' });
const dayOf = (t: number) => DAY.format(new Date(t)).replace('.', '');
/** "Mi 06:10–11:40", "Mi 22:50 – Do 03:20", "bis Mi 11:40" (already open), "ab Do 06:10" (the source ends inside it). */
export function tideWindowLabel(w: TideWindow, short = false): string {
  const a = `${short ? '' : `${dayOf(w.from)} `}${HM.format(new Date(w.from))}`;
  const sameDay = dayOf(w.from) === dayOf(w.to);
  const b = `${short || sameDay ? '' : `${dayOf(w.to)} `}${HM.format(new Date(w.to))}`;
  if (w.openStart && w.openEnd) return short ? `bis ${b}` : `durchgehend bis ${dayOf(w.to)} ${HM.format(new Date(w.to))}`;
  if (w.openStart) return `bis ${short ? b : `${dayOf(w.to)} ${HM.format(new Date(w.to))}`}`;
  if (w.openEnd) return `ab ${a}`;
  return short || sameDay ? `${a}–${b}` : `${a} – ${b}`;
}
/** The same words on two short lines for a band of the chart: ["06:10", "–11:40"], ["bis", "11:40"], ["ab", "06:10"]. */
export function tideWindowLines(w: TideWindow): [string, string] {
  const a = HM.format(new Date(w.from)), b = HM.format(new Date(w.to));
  return w.openStart ? ['bis', b] : w.openEnd ? ['ab', a] : [a, `–${b}`];
}
