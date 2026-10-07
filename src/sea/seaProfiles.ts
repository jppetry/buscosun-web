/**
 * SW-6 — Profiles, classes, windows, shore angle of the Seewetter page (plan SW-6, table "Profil"). Pure and
 * dependency-free (sun altitude from `src/photo/sun.ts`), so the page, the verifier and the archive evaluation use the
 * same rules. The limits are STARTING values (`set`, not calibrated — there is no truth set for "was a good kite
 * day"), visible in the dock and editable per user (localStorage). No profile ever says "sicher": the classes compare
 * the model with YOUR limits and every class names its reason.
 */
import { sunAltitudeDeg } from '../photo/sun';

export type SeaProfileId = 'kite' | 'wing' | 'sup' | 'jolle' | 'yacht' | 'motor' | 'angeln';
export type SeaClass = 'passt' | 'knapp' | 'ausserhalb' | 'keine';

export interface SeaLimits {
  /** Wind (10-min mean) in knots: lower and upper limit; `null` = no limit. */
  windMin: number | null;
  windMax: number | null;
  /** Gusts in knots, upper limit. */
  gustMax: number | null;
  /** Gust spread (gust − wind) in knots, upper limit (kite). */
  spreadMax: number | null;
  /** Significant wave height total (m), upper limit. */
  hsMax: number | null;
  /** Wind-sea height (m), upper limit (motor boat). */
  wsMax: number | null;
  /** Yacht: wind-sea mean period at least this many seconds when Hs exceeds `steepHsM` ("kurze steile See"). */
  steepMinPerS: number | null;
  steepHsM: number | null;
  /** `oblique`: offshore and oblique offshore are outside ("nicht ablandig", "nie ablandig"). */
  noOffshore: boolean;
  /** Only between sunrise and sunset. */
  daylight: boolean;
}

export interface SeaProfile { id: SeaProfileId; label: string; short: string; limits: SeaLimits }

const L = (o: Partial<SeaLimits>): SeaLimits => ({
  windMin: null, windMax: null, gustMax: null, spreadMax: null, hsMax: null, wsMax: null, steepMinPerS: null, steepHsM: null, noOffshore: false, daylight: false, ...o,
});

/** Plan SW-6 table, verbatim. */
export const SEA_PROFILES: readonly SeaProfile[] = Object.freeze([
  { id: 'kite', label: 'Kite', short: 'Kite', limits: L({ windMin: 15, windMax: 28, gustMax: 33, spreadMax: 10, noOffshore: true, daylight: true }) },
  { id: 'wing', label: 'Wing/Surf', short: 'Wing', limits: L({ windMin: 12, windMax: 25, gustMax: 30, noOffshore: true, daylight: true }) },
  { id: 'sup', label: 'SUP/Kajak', short: 'SUP', limits: L({ windMax: 10, gustMax: 14, hsMax: 0.5, noOffshore: true, daylight: true }) },
  { id: 'jolle', label: 'Jolle', short: 'Jolle', limits: L({ windMin: 5, windMax: 16, gustMax: 20, hsMax: 0.8, daylight: true }) },
  { id: 'yacht', label: 'Yacht', short: 'Yacht', limits: L({ windMin: 8, windMax: 22, gustMax: 27, hsMax: 2.0, steepMinPerS: 3.5, steepHsM: 1 }) },
  { id: 'motor', label: 'Motorboot', short: 'Motor', limits: L({ windMax: 18, gustMax: 24, wsMax: 1.0 }) },
  { id: 'angeln', label: 'Angeln', short: 'Angeln', limits: L({ windMax: 16, gustMax: 22, hsMax: 1.2 }) },
]);
export const SEA_PROFILE_BY_ID: Readonly<Record<SeaProfileId, SeaProfile>> = Object.freeze(Object.fromEntries(SEA_PROFILES.map((p) => [p.id, p])) as Record<SeaProfileId, SeaProfile>);
export const isProfileId = (s: string | null | undefined): s is SeaProfileId => !!s && s in SEA_PROFILE_BY_ID;

/** "knapp" = inside the limits but within 10 % of a limit (plan). */
export const SEA_TIGHT_SHARE = 0.10;

// --- Units ----------------------------------------------------------------------------------------

export const MS_TO_KN = 1.943844;
export type SeaUnit = 'kn' | 'bft' | 'kmh';
export const SEA_UNITS: readonly SeaUnit[] = ['kn', 'bft', 'kmh'];
/** WMO Beaufort scale, upper limits in knots (Bft 6 = 22–27 kn, 7 = 28–33, 8 = 34–40). */
const BFT_KN = [1, 3, 6, 10, 16, 21, 27, 33, 40, 47, 55, 63];
export function knToBft(kn: number): number { const i = BFT_KN.findIndex((x) => kn < x + 0.5); return i < 0 ? 12 : i; }
export function fmtWind(ms: number | null, unit: SeaUnit): string {
  if (ms == null || !Number.isFinite(ms)) return '–';
  const kn = ms * MS_TO_KN;
  if (unit === 'bft') return String(knToBft(kn));
  if (unit === 'kmh') return String(Math.round(ms * 3.6));
  return String(Math.round(kn));
}
export const unitLabel = (u: SeaUnit) => (u === 'kn' ? 'kn' : u === 'bft' ? 'Bft' : 'km/h');

// --- Shore angle (plan SW-6) -----------------------------------------------------------------------

export type ShoreAngle = 'auflandig' | 'schraeg-auflandig' | 'sideshore' | 'schraeg-ablandig' | 'ablandig';
export const SHORE_LABEL: Readonly<Record<ShoreAngle, string>> = Object.freeze({
  auflandig: 'auflandig', 'schraeg-auflandig': 'schräg auflandig', sideshore: 'sideshore', 'schraeg-ablandig': 'schräg ablandig', ablandig: 'ablandig',
});
/** Angle between the direction the wind COMES FROM and the shore normal (pointing seaward): 0° = wind from the sea. */
export function shoreAngle(windFromDeg: number | null, normalDeg: number): ShoreAngle | null {
  if (windFromDeg == null || !Number.isFinite(windFromDeg)) return null;
  const d = Math.abs(((windFromDeg - normalDeg + 540) % 360) - 180);
  if (d <= 30) return 'auflandig';
  if (d <= 75) return 'schraeg-auflandig';
  if (d <= 105) return 'sideshore';
  if (d <= 150) return 'schraeg-ablandig';
  return 'ablandig';
}

// --- Classes ------------------------------------------------------------------------------------------

export interface SeaHour {
  /** Valid time (UTC ms). */
  t: number;
  windMs: number | null; gustMs: number | null; windDir: number | null;
  hs: number | null; ws: number | null; wsPer: number | null;
}
export interface SeaVerdict { cls: SeaClass; reasons: string[]; shore: ShoreAngle | null; daylight: boolean }

const kn = (ms: number | null) => (ms == null ? null : ms * MS_TO_KN);
const f1 = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** One hour against one profile. `normal` = the spot's shore normal. Order of reasons: worst first. */
export function classify(h: SeaHour, limits: SeaLimits, normal: number, lat: number, lon: number): SeaVerdict {
  const out: string[] = [], tight: string[] = [], missing: string[] = [];
  const w = kn(h.windMs), g = kn(h.gustMs);
  const shore = shoreAngle(h.windDir, normal);
  const daylight = sunAltitudeDeg(new Date(h.t + 30 * 60_000), lat, lon) > -0.833;
  const needWind = limits.windMin != null || limits.windMax != null;
  const upper = (val: number | null, lim: number | null, what: string, unit: string, fmt = (x: number) => String(Math.round(x))) => {
    if (lim == null) return;
    if (val == null) { missing.push(what); return; }
    if (val > lim) out.push(`${what} über ${fmt(lim)} ${unit}`);
    else if (val > lim * (1 - SEA_TIGHT_SHARE)) tight.push(`${what} ${fmt(val)} ${unit} nahe ${fmt(lim)} ${unit}`);
  };
  if (needWind && w == null) missing.push('Wind');
  if (w != null && limits.windMin != null) {
    if (w < limits.windMin) out.push(`Wind unter ${limits.windMin} kn`);
    else if (w < limits.windMin * (1 + SEA_TIGHT_SHARE)) tight.push(`Wind ${Math.round(w)} kn nahe ${limits.windMin} kn`);
  }
  if (w != null) upper(w, limits.windMax, 'Wind', 'kn');
  upper(g, limits.gustMax, 'Böen', 'kn');
  if (limits.spreadMax != null) {
    if (w == null || g == null) missing.push('Böenspanne');
    else upper(g - w, limits.spreadMax, 'Böenspanne', 'kn');
  }
  upper(h.hs, limits.hsMax, 'Welle', 'm', f1);
  upper(h.ws, limits.wsMax, 'Windsee', 'm', f1);
  if (limits.steepMinPerS != null && limits.steepHsM != null) {
    if (h.hs == null) missing.push('Welle');
    else if (h.hs > limits.steepHsM) {
      if (h.wsPer == null) missing.push('Windsee-Periode');
      else if (h.wsPer < limits.steepMinPerS) out.push(`kurze steile See: Windsee-Periode ${f1(h.wsPer)} s unter ${f1(limits.steepMinPerS)} s bei Welle über ${f1(limits.steepHsM)} m`);
      else if (h.wsPer < limits.steepMinPerS * (1 + SEA_TIGHT_SHARE)) tight.push(`Windsee-Periode ${f1(h.wsPer)} s nahe ${f1(limits.steepMinPerS)} s`);
    }
  }
  if (limits.noOffshore) {
    if (shore == null) missing.push('Windrichtung');
    else if (shore === 'ablandig' || shore === 'schraeg-ablandig') out.push(`Wind ${SHORE_LABEL[shore]}`);
  }
  if (limits.daylight && !daylight) out.push('Dunkelheit');
  if (out.length) return { cls: 'ausserhalb', reasons: out, shore, daylight };
  if (missing.length) return { cls: 'keine', reasons: missing.map((m) => `${m} fehlt`), shore, daylight };
  if (tight.length) return { cls: 'knapp', reasons: tight, shore, daylight };
  return { cls: 'passt', reasons: ['innerhalb deiner Grenzen'], shore, daylight };
}

// --- Windows (plan: at least two consecutive hours "passt" or "knapp") -------------------------------

export interface SeaWindow { from: number; to: number; hours: number; tight: boolean }
export const SEA_WINDOW_MIN_H = 2;
/** Consecutive runs of hourly verdicts in class passt/knapp with length ≥ 2; `times` = valid time per index. */
export function windows(verdicts: SeaVerdict[], times: number[]): SeaWindow[] {
  const out: SeaWindow[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start >= 0 && end - start + 1 >= SEA_WINDOW_MIN_H) {
      out.push({ from: times[start], to: times[end] + 3_600_000, hours: end - start + 1, tight: verdicts.slice(start, end + 1).some((v) => v.cls === 'knapp') });
    }
    start = -1;
  };
  verdicts.forEach((v, i) => {
    const ok = v.cls === 'passt' || v.cls === 'knapp';
    const contiguous = i > 0 && times[i] - times[i - 1] === 3_600_000;
    if (ok && start < 0) start = i;
    else if (ok && !contiguous) { close(i - 1); start = i; }
    else if (!ok) close(i - 1);
  });
  close(verdicts.length - 1);
  return out;
}
/** Next window that has not ended at `nowMs`, and the longest one. */
export function nextAndLongest(ws: SeaWindow[], nowMs: number): { next: SeaWindow | null; longest: SeaWindow | null } {
  const ahead = ws.filter((w) => w.to > nowMs);
  return { next: ahead[0] ?? null, longest: ahead.reduce<SeaWindow | null>((a, w) => (!a || w.hours > a.hours ? w : a), null) };
}

// --- Editable limits (local, per user) ---------------------------------------------------------------

export const SEA_LIMITS_KEY = 'sea.limits.v1';
export function loadLimits(id: SeaProfileId, storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): SeaLimits {
  const base = SEA_PROFILE_BY_ID[id].limits;
  try {
    const all = JSON.parse(storage?.getItem(SEA_LIMITS_KEY) ?? '{}');
    const o = all?.[id];
    if (!o || typeof o !== 'object') return base;
    const num = (k: keyof SeaLimits) => (o[k] === null || (typeof o[k] === 'number' && Number.isFinite(o[k]) && o[k] >= 0) ? o[k] : base[k]);
    return { ...base, windMin: num('windMin') as number | null, windMax: num('windMax') as number | null, gustMax: num('gustMax') as number | null, spreadMax: num('spreadMax') as number | null, hsMax: num('hsMax') as number | null, wsMax: num('wsMax') as number | null };
  } catch { return base; }
}
export function saveLimits(id: SeaProfileId, limits: SeaLimits | null, storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  try {
    const all = JSON.parse(storage?.getItem(SEA_LIMITS_KEY) ?? '{}') ?? {};
    if (limits) all[id] = limits; else delete all[id];
    storage?.setItem(SEA_LIMITS_KEY, JSON.stringify(all));
  } catch { /* private mode: limits hold for this page view only */ }
}
export const limitsChanged = (id: SeaProfileId, l: SeaLimits) => JSON.stringify(l) !== JSON.stringify(SEA_PROFILE_BY_ID[id].limits);

/** Plain-language summary of a profile's limits for the dock ("Wind 15–28 kn · Böen bis 33 kn · …"). */
export function limitsSummary(l: SeaLimits): string {
  const parts: string[] = [];
  if (l.windMin != null && l.windMax != null) parts.push(`Wind ${l.windMin}–${l.windMax} kn`);
  else if (l.windMax != null) parts.push(`Wind bis ${l.windMax} kn`);
  else if (l.windMin != null) parts.push(`Wind ab ${l.windMin} kn`);
  if (l.gustMax != null) parts.push(`Böen bis ${l.gustMax} kn`);
  if (l.spreadMax != null) parts.push(`Böenspanne ≤ ${l.spreadMax} kn`);
  if (l.hsMax != null) parts.push(`Welle ≤ ${f1(l.hsMax)} m`);
  if (l.wsMax != null) parts.push(`Windsee ≤ ${f1(l.wsMax)} m`);
  if (l.steepMinPerS != null) parts.push(`Windsee-Periode ≥ ${f1(l.steepMinPerS)} s bei Welle > ${f1(l.steepHsM ?? 0)} m`);
  if (l.noOffshore) parts.push('nicht ablandig');
  if (l.daylight) parts.push('nur hell');
  return parts.join(' · ');
}
