/**
 * AW-5 — View model of Autobahnwetter: everything the components show that is computed, kept DOM-free so
 * `verify:road-ui` can check it without a browser. No forecast logic lives here (AW-6, Gate D); the mockup's
 * script (cosine day curve, class derivation) is illustration only and was NOT reused (README-autobahnwetter.md).
 */
import { ROAD_CLASS_LABEL, ROAD_CLASS_RANK, ROAD_CONDITION_LABEL, type RoadClass } from './roadClasses';
import { roadFreshness, type RoadFreshness, type RoadObsFile, type RoadPoint, type RoadRuleId } from './roadContract';
import type { CapAlert } from '../warnings/capAlerts';
import { isActiveAt } from '../warnings/warnField';
import type { RoadCorridor } from './roadClient';

/** Class colours (= `--aw-*` tokens; MapLibre paints need literal values). */
export const ROAD_CLASS_COLOR: Readonly<Record<RoadClass, string>> = Object.freeze({
  ice: '#B5321F', frost: '#E39A3B', wet: '#5E97D1', dry: '#8DB07A', unknown: '#8B8474', nodata: '#8B8474',
});
/** Text colour on a class-coloured badge (design CLS.ink). */
export const ROAD_CLASS_INK: Readonly<Record<RoadClass, string>> = Object.freeze({
  ice: '#FFFFFF', frost: '#2C2A26', wet: '#0B0E12', dry: '#1E2A17', unknown: '#FFFFFF', nodata: '#FFFFFF',
});
/** Hatched classes: no valid state — never drawn like "dry" (D-04). */
export const isHatched = (c: RoadClass) => c === 'nodata' || c === 'unknown';
export const isCritical = (c: RoadClass) => c === 'ice' || c === 'frost';

// --- formatting (German) ------------------------------------------------------------------------

/** Signed one-decimal value with comma and real minus: `−1,4`, `+0,9`, `±0,0`. */
export function f1(v: number): string {
  if (Math.abs(v) < 0.05) return '±0,0';
  return (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1).replace('.', ',');
}
export const dec = (v: number, d = 1) => v.toFixed(d).replace('.', ',').replace('-', '−');
const TZ = 'Europe/Berlin';
/** `06:15` in German local time (the road network is German; DST handled by Intl). */
export function hm(ms: number): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(ms);
}
export function visText(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${dec(m / 1000)} km`;
}
export function ageMinText(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  return `vor ${h} h ${m % 60} min`;
}
/** `A8` → `A 8` (shield text). */
export const shieldText = (road: string) => road.replace(/^([A-Z])(\d)/, '$1 $2');

// --- slot / freshness ----------------------------------------------------------------------------

export interface RoadSlotSummary {
  freshness: RoadFreshness;
  slotLabel: string;
  activeGroups: number;
  totalGroups: number;
  missingGroups: string[];
}

export function slotSummary(obs: RoadObsFile | null, nowMs: number): RoadSlotSummary {
  if (!obs) return { freshness: 'dead', slotLabel: '—', activeGroups: 0, totalGroups: 0, missingGroups: [] };
  const groups = Object.entries(obs.groups);
  const regular = groups.filter(([id]) => id !== 'SD-BW');
  return {
    freshness: roadFreshness(obs.slotMs, nowMs, obs.killed),
    slotLabel: hm(obs.slotMs),
    activeGroups: regular.filter(([, g]) => g.state === 'ok').length,
    totalGroups: regular.length,
    missingGroups: regular.filter(([, g]) => g.state !== 'ok').map(([id]) => id),
  };
}

// --- corridors ----------------------------------------------------------------------------------

export interface CorridorStatus {
  /** Stations with a valid road temperature. */
  measured: number;
  critical: number;
  /** Measured, but no valid road condition (class `unknown`). */
  unknown: number;
  /** No valid measurement at all (class `nodata` or no point in the slot). */
  nodata: number;
  /** Class of the corridor's status dot (D-04: never `dry` when most stations do not know their state). */
  worst: RoadClass;
}

/**
 * Status of a corridor for the dock. A measured warning class (ice, frost, wet) always decides. Otherwise the dot is
 * `dry` only when more stations measured "dry" than "state unknown" — one dry station among 29 unknown ones must not
 * paint the motorway green (review finding #7); else it is hatched (`unknown`, or `nodata` without any measurement).
 */
export function corridorStatus(c: RoadCorridor, byId: ReadonlyMap<string, RoadPoint>): CorridorStatus {
  let measured = 0, critical = 0, unknown = 0, nodata = 0, dry = 0;
  let warn: RoadClass | null = null;
  for (const s of c.stations) {
    const p = byId.get(s.id);
    if (!p || p.cls === 'nodata') { nodata++; continue; }
    if (p.rs != null) measured++;
    if (isCritical(p.cls)) critical++;
    if (p.cls === 'unknown') unknown++;
    else if (p.cls === 'dry') dry++;
    else if (!warn || ROAD_CLASS_RANK[p.cls] > ROAD_CLASS_RANK[warn]) warn = p.cls;
  }
  const worst: RoadClass = warn ?? (dry > unknown ? 'dry' : unknown > 0 ? 'unknown' : dry > 0 ? 'dry' : 'nodata');
  return { measured, critical, unknown, nodata, worst };
}

/** Warning classes rank for the default station; every other class shares rank 0. */
const DEFAULT_RANK: Readonly<Partial<Record<RoadClass, number>>> = Object.freeze({ ice: 3, frost: 2, wet: 1 });

/**
 * Default station of a corridor (E-AW-13, Jan 03.10.2026): the most critical measured class first (ice, frost, wet),
 * on a tie the coldest road surface; without a warning class the coldest measured road, without any measurement the
 * first station (corridor order). A measured ice patch at a warmer spot no longer hides behind a colder dry one.
 */
export function defaultRoadStation(ps: readonly RoadPoint[]): RoadPoint | null {
  let best: RoadPoint | null = null;
  for (const p of ps) {
    if (!best) { best = p; continue; }
    const r = (DEFAULT_RANK[p.cls] ?? 0) - (DEFAULT_RANK[best.cls] ?? 0);
    if (r > 0 || (r === 0 && p.rs != null && (best.rs == null || p.rs < best.rs))) best = p;
  }
  return best;
}

/** Tie rank in the band: warning classes first, then hatched (unknown, no data) before dry — the cautious reading. */
const TIE_RANK: Readonly<Record<RoadClass, number>> = Object.freeze({ ice: 5, frost: 4, wet: 3, unknown: 2, nodata: 1, dry: 0 });

/** Corridor km in the chosen direction (dir 1 = reversed axis). */
export const kmIn = (c: RoadCorridor, km: number, dir: 0 | 1) => (dir ? c.lengthKm - km : km);

export function corridorEnds(c: RoadCorridor, dir: 0 | 1): { from: string; to: string } {
  const a = c.from ?? c.road, b = c.to ?? c.road;
  return dir ? { from: b, to: a } : { from: a, to: b };
}

export interface BandSegment {
  fromKm: number;
  toKm: number;
  cls: RoadClass | 'gap';
}

/** Plan/design: each km takes the class of the nearest station within 10 km; further away = gap (sand hatching). */
export const BAND_REACH_KM = 10;

export function bandSegments(c: RoadCorridor, byId: ReadonlyMap<string, RoadPoint>, dir: 0 | 1): BandSegment[] {
  const st = c.stations.map((s) => ({ km: kmIn(c, s.km, dir), cls: byId.get(s.id)?.cls ?? 'nodata' as RoadClass }));
  const out: BandSegment[] = [];
  const len = Math.max(1, Math.ceil(c.lengthKm));
  for (let km = 0; km < len; km++) {
    const mid = km + 0.5;
    let best: { d: number; cls: RoadClass } | null = null;
    for (const s of st) {
      const d = Math.abs(s.km - mid);
      // Equal distance: the more cautious class wins (warning, then "not known", then dry).
      if (!best || d < best.d || (d === best.d && TIE_RANK[s.cls] > TIE_RANK[best.cls])) best = { d, cls: s.cls };
    }
    const cls: RoadClass | 'gap' = best && best.d <= BAND_REACH_KM ? best.cls : 'gap';
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.toKm = km + 1;
    else out.push({ fromKm: km, toKm: km + 1, cls });
  }
  if (out.length) out[out.length - 1].toKm = c.lengthKm;
  return out;
}

/** km-axis ticks: a "round" step giving about 6–8 ticks. */
export function kmTicks(lengthKm: number): number[] {
  const steps = [5, 10, 20, 25, 50, 100, 150, 200];
  const step = steps.find((s) => lengthKm / s <= 7) ?? 250;
  const out: number[] = [];
  for (let k = 0; k <= lengthKm + 1e-9; k += step) out.push(k);
  return out;
}

// --- route briefing (tab „Strecke") ---------------------------------------------------------------

export const DEFAULT_SPEED_KMH = 100;
/** Design: „bis +30 min Messung" — beyond that only AW-6 could say more; until Gate D the row says so. */
export const MEASURED_ETA_MIN = 30;

export interface EtaRow {
  id: string;
  km: number;
  name: string;
  etaMs: number;
  point: RoadPoint | null;
  /** ETA within +30 min of the measurement ⇒ the measurement stands for the arrival. */
  measuredAtArrival: boolean;
}

export function etaRows(c: RoadCorridor, byId: ReadonlyMap<string, RoadPoint>, dir: 0 | 1, departMs: number, slotMs: number, speedKmh = DEFAULT_SPEED_KMH): EtaRow[] {
  return c.stations
    .map((s) => {
      const km = kmIn(c, s.km, dir);
      const etaMs = departMs + (km / speedKmh) * 3_600_000;
      const p = byId.get(s.id) ?? null;
      return { id: s.id, km, name: p?.n ?? s.id, etaMs, point: p, measuredAtArrival: etaMs - slotMs <= MEASURED_ETA_MIN * 60_000 };
    })
    .sort((a, b) => a.km - b.km);
}

// --- driver hint (rule based, value + source in one sentence, no warning or all-clear language) ----

const FIELD_REJECT_TEXT: Partial<Record<RoadRuleId, string>> = {
  placeholder: 'einen Geräteplatzhalter (unter −60 °C)',
  stuck: 'seit mehr als 6 Stunden denselben Wert (hängender Sensor)',
  limit: 'einen Wert außerhalb des physikalisch Möglichen',
  dwdSuspect: 'einen Wert, den der DWD als zweifelhaft markiert',
};

export function conditionText(cond: number | null): string | null {
  return cond == null ? null : ROAD_CONDITION_LABEL[cond] ?? null;
}

export function driverHint(p: RoadPoint): string {
  const at = ` (GMA ${p.n}, ${hm(p.t)})`;
  const rr = p.rs != null ? f1(p.rs) : null;
  const dw = p.td != null ? `${f1(p.td)} °C` : 'unbekannt';
  const code = conditionText(p.cond);
  switch (p.cls) {
    case 'ice':
      return `Fahrbahn ${rr ?? '—'} °C gemessen, Zustand „${code ?? 'Glätte'}“, Taupunkt ${dw}${at}. Glätte an dieser Messstelle.`;
    case 'frost':
      return `Fahrbahn ${rr} °C gemessen bei Taupunkt ${dw}${code ? `, Fahrbahn ${code}` : ''}${at}. Überfrieren möglich.`
        + (p.vis != null && p.vis < 150 ? ` Sicht ${visText(p.vis)} (Nebel).` : '');
    case 'wet':
      return `Fahrbahn ${code ?? 'nass'} bei ${rr} °C${p.wf != null && p.wf > 0 ? `, Wasserfilm ${dec(p.wf)} mm` : ''}${at}.`;
    case 'dry':
      return `Messstelle trocken bei ${rr} °C${at}. Das gilt für diesen Punkt, nicht für die ganze Strecke.`;
    case 'unknown':
      return `Fahrbahn ${rr} °C gemessen, ein Zustand liegt nicht vor${at}. Ob die Fahrbahn nass oder trocken ist, ist an dieser Stelle unbekannt.`;
    case 'nodata':
    default: {
      const why = p.x?.rs ? FIELD_REJECT_TEXT[p.x.rs] : null;
      return why
        ? `Der Fahrbahnsensor meldet ${why}; buscosun verwirft ihn. Über den Fahrbahnzustand an dieser Stelle ist nichts bekannt.`
        : 'Diese Anlage meldet derzeit keine Fahrbahntemperatur. Über den Fahrbahnzustand an dieser Stelle ist nichts bekannt.';
    }
  }
}

/** Badge text of the readout. */
export function classBadge(p: RoadPoint): string {
  if (p.cls === 'ice') return `Glätte gemessen · ${conditionText(p.cond) ?? '—'}`;
  return ROAD_CLASS_LABEL[p.cls].label;
}

/** Hint-box colours per class (design TINT). */
export const ROAD_CLASS_TINT: Readonly<Record<RoadClass, { bg: string; border: string; ink: string }>> = Object.freeze({
  ice: { bg: '#FBE9E4', border: '#E8C9BD', ink: '#8A1C1C' },
  frost: { bg: '#FBF3E7', border: '#E3C39A', ink: '#7A4520' },
  wet: { bg: '#EAF1F7', border: '#C7D6E4', ink: '#28507A' },
  dry: { bg: '#EFF3E8', border: '#C3D2AF', ink: '#4D6A3B' },
  unknown: { bg: '#F4F0E4', border: '#D9D0B8', ink: '#5C5447' },
  nodata: { bg: '#F4F0E4', border: '#D9D0B8', ink: '#5C5447' },
});

// --- warnings ---------------------------------------------------------------------------------------

/** DWD warning groups that matter on the road (design: „Glätte, Glatteis, Nebel, Sturm"); heat/UV are left out. */
export const ROAD_WARN_GROUPS: ReadonlySet<string> = new Set(['FROST', 'SNOWFALL', 'SNOWDRIFT', 'GLAZE', 'ICE', 'FOG', 'WIND', 'THUNDERSTORM', 'RAIN', 'HAIL']);
export function isRoadWarning(group: string | null, event: string): boolean {
  if (group) return ROAD_WARN_GROUPS.has(group);
  return /GLÄTTE|GLATTEIS|FROST|NEBEL|SCHNEE|STURM|ORKAN|GEWITTER|REGEN/i.test(event);
}

/**
 * Warnings are re-fetched at least this often and filtered by the clock when drawn (docs/API.md §7: short TTL,
 * "veraltete Warnungen sind gefährlicher als keine"; review finding #8). `fetchDwdWarnings` has its own cache.
 */
export const ROAD_WARN_REFRESH_MS = 5 * 60_000;
/** The page's warnings at `nowMs`: an expired or not yet started warning is never shown. */
export function activeRoadWarnings<T extends Pick<CapAlert, 'onsetMs' | 'effectiveMs' | 'expiresMs'>>(alerts: readonly T[], nowMs: number): T[] {
  return alerts.filter((a) => isActiveAt(a as unknown as CapAlert, nowMs));
}
/** Official DWD warnings page — the fallback link when the feed cannot be read (docs/API.md §7). */
export const DWD_WARNINGS_URL = 'https://www.dwd.de/DE/wetter/warnungen_gemeinden/warnWetter_node.html';

// --- motorway rows of the dock ----------------------------------------------------------------------

/** Numeric sort key of a road (`A8` → 8). */
export const roadNumber = (road: string) => Number(road.replace(/\D/g, '')) || 999;

export function searchCorridors(cs: readonly RoadCorridor[], byId: ReadonlyMap<string, RoadPoint>, q: string): RoadCorridor[] {
  const t = q.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return cs.slice();
  // „A 8" / „a8" means exactly that motorway (not A 81, A 8x).
  if (/^[a-z]\d{1,3}$/.test(t)) return cs.filter((c) => c.road.toLowerCase() === t);
  return cs.filter((c) => {
    const hay = `${c.road} ${c.title} ${c.towns.map((x) => x[1]).join(' ')}`.toLowerCase().replace(/\s+/g, '');
    if (hay.includes(t)) return true;
    return c.stations.some((s) => (byId.get(s.id)?.n ?? '').toLowerCase().replace(/\s+/g, '').includes(t));
  });
}

export const isStale = (f: RoadFreshness) => f !== 'live';
