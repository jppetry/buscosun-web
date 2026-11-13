/**
 * Phase TE — pure derivations of the new route result view (`audit/tour-ergebnis.md`). No React, no `window`: the
 * verifier (`scripts/verify-tour-result.mjs`) runs every function headless.
 *
 * Every value comes from the samples the pipeline enriched (`enrichSampleWeather` → buscosun Fusion per cluster) and from
 * `meta.startWindow`. Nothing here computes weather; it only classifies, weighs and finds changes. Thresholds marked
 * `set` are design choices, not measured.
 */
import type { SampleETA } from './tourTiming';
import type { EnrichmentMeta, StartWindowEntry } from '../pointForecast/weatherEnrichment';
import { bearingAtDist, headwindComponentMps } from './windEffect';
import { FUSION_CURRENT, fusionName, type FusionSource } from '../pointForecast/fusion/fusionRelease';

type Pt = { lat: number; lon: number; dist: number };

/* ============================ Wind relative to the direction of travel ============================ */

/** Below this mean wind the relation is „kaum Wind" — the threshold of the result map markers since R3D (`set`). */
export const WIND_CALM_MPS = 4;
/** |along-track component| up to this counts as crosswind — the map marker threshold (`set`). */
export const WIND_CROSS_MPS = 0.7;

export type WindRel = 'head' | 'cross' | 'tail' | 'calm';
export interface WindRelation { rel: WindRel; componentMps: number; travelBearingDeg: number }

/** One colour map for every view of the result (tokens of designTokens.css; V-TE-2). */
export const WIND_REL_COLOR: Record<WindRel, string> = {
  tail: 'var(--rd-sage-strong, #5F7A4C)',
  cross: 'var(--terracotta-500, #C97B47)',
  head: 'var(--rd-red, #A8431F)',
  calm: 'var(--stone-300, #B9AE93)',
};
export const WIND_REL_WORD: Record<WindRel, string> = { head: 'Gegenwind', cross: 'Seitenwind', tail: 'Rückenwind', calm: 'kaum Wind' };

/**
 * Wind relative to the travel direction at a sample. `null` when the sample has no wind, or a wind above the calm
 * threshold without a direction (E-FR-5: an hour without a direction stays without one — never read as 0° = north).
 */
export function windRelationAt(sample: Pick<SampleETA, 'dist' | 'weather'>, points: Pt[]): WindRelation | null {
  const w = sample.weather;
  if (!w || w.windSpeedMps == null || !Number.isFinite(w.windSpeedMps)) return null;
  const travelBearingDeg = bearingAtDist(points, sample.dist);
  if (w.windDirectionDeg == null || !Number.isFinite(w.windDirectionDeg)) {
    return w.windSpeedMps < WIND_CALM_MPS ? { rel: 'calm', componentMps: 0, travelBearingDeg } : null;
  }
  const componentMps = headwindComponentMps(travelBearingDeg, w.windDirectionDeg, w.windSpeedMps);
  if (w.windSpeedMps < WIND_CALM_MPS) return { rel: 'calm', componentMps, travelBearingDeg };
  const rel: WindRel = componentMps > WIND_CROSS_MPS ? 'tail' : componentMps < -WIND_CROSS_MPS ? 'head' : 'cross';
  return { rel, componentMps, travelBearingDeg };
}

/** Distance each sample stands for: half the gap to each neighbour (m). Sum = route length between first and last sample. */
export function sampleSpansM(samples: ReadonlyArray<{ dist: number }>): number[] {
  const n = samples.length;
  if (n < 2) return samples.map(() => 0);
  return samples.map((_, i) => {
    const a = samples[Math.max(0, i - 1)].dist, b = samples[Math.min(n - 1, i + 1)].dist;
    return Math.max(0, (b - a) / 2);
  });
}

export interface WindShares {
  /** Share of the route length per relation (0..1), weighted by distance, not by sample count. */
  share: Record<WindRel | 'unknown', number>;
  /** The strongest headwind (most negative along-track component) — null when there is none. */
  strongestHead: { index: number; dist: number; etaMs: number; componentMps: number } | null;
}

export function windShares(samples: SampleETA[], points: Pt[]): WindShares {
  const spans = sampleSpansM(samples);
  const total = spans.reduce((a, b) => a + b, 0);
  const acc: Record<WindRel | 'unknown', number> = { head: 0, cross: 0, tail: 0, calm: 0, unknown: 0 };
  let strongestHead: WindShares['strongestHead'] = null;
  samples.forEach((s, i) => {
    const r = windRelationAt(s, points);
    acc[r ? r.rel : 'unknown'] += spans[i];
    if (r && r.rel === 'head' && (!strongestHead || r.componentMps < strongestHead.componentMps)) {
      strongestHead = { index: i, dist: s.dist, etaMs: s.etaMs, componentMps: r.componentMps };
    }
  });
  const share = { ...acc };
  for (const k of Object.keys(share) as Array<keyof typeof share>) share[k] = total > 0 ? acc[k] / total : 0;
  return { share, strongestHead };
}

/* ============================ Changes along the route ============================ */

/** Wet from this rate on (mm/h) — the same value as the start window (`WET_MIN_MMH`) and `nowcastModel.WET_MMH` (V-TE-5). */
export const TOUR_WET_MMH = 0.1;
/** Temperature change worth a marker (K) within the window below (`set`). */
export const TEMP_CHANGE_K = 2;
/** Window of the temperature change (m) (`set`). */
export const TEMP_CHANGE_WINDOW_M = 2_000;
/** First gust at or above this (m/s, = 36 km/h) is a marker (`set`). */
export const GUST_EVENT_MPS = 10;
/** A switch to headwind is a marker from this along-track component on (m/s) (`set`). */
export const HEADWIND_EVENT_MPS = 2;
/** Start→finish label: „deutlich" from these deltas, „spürbar" from the lower ones (`set`). */
export const CHANGE_STRONG = { tempK: 5, windMps: 5, cloudPct: 50, wetShare: 0.5 } as const;
export const CHANGE_NOTICEABLE = { tempK: 2, windMps: 2.5, cloudPct: 25, wetShare: 0.2 } as const;
/** Share of the route at each end that the start/finish wet share is taken over (`set`). */
export const END_SHARE = 0.25;

export type ChangeKind = 'rain-start' | 'rain-stop' | 'cooling' | 'warming' | 'gust' | 'headwind';
export interface WeatherChange {
  kind: ChangeKind;
  index: number;
  dist: number;
  etaMs: number;
  text: string;
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

/** All markers, sorted along the route. Samples without the needed value are skipped, never read as 0. */
export function weatherChanges(samples: SampleETA[], points: Pt[]): WeatherChange[] {
  const ev: WeatherChange[] = [];
  const at = (s: SampleETA) => ({ index: s.index, dist: s.dist, etaMs: s.etaMs });

  // rain starts / stops
  let wet: boolean | null = null;
  samples.forEach((s, i) => {
    const r = s.weather?.precipitationMmH;
    if (r == null || !Number.isFinite(r)) return;
    const now = r >= TOUR_WET_MMH;
    if (wet !== null && now !== wet) ev.push({ kind: now ? 'rain-start' : 'rain-stop', ...at(s), index: i, text: now ? 'Regen setzt ein' : 'Regen hört auf' });
    wet = now;
  });

  // temperature change ≥ TEMP_CHANGE_K within TEMP_CHANGE_WINDOW_M
  let ref = -1;
  samples.forEach((s, i) => {
    const t = s.weather?.temperatureC;
    if (t == null || !Number.isFinite(t)) return;
    if (ref < 0) { ref = i; return; }
    while (ref < i && s.dist - samples[ref].dist > TEMP_CHANGE_WINDOW_M) {
      ref++;
      while (ref < i && samples[ref].weather?.temperatureC == null) ref++;
    }
    const t0 = samples[ref].weather?.temperatureC;
    if (ref === i || t0 == null) return;
    const dT = t - t0;
    if (Math.abs(dT) >= TEMP_CHANGE_K) {
      const dKm = (s.dist - samples[ref].dist) / 1000;
      ev.push({ kind: dT < 0 ? 'cooling' : 'warming', ...at(s), index: i, text: `${dT < 0 ? 'Abkühlung' : 'Erwärmung'} ${fmt1(Math.abs(dT))} °C auf ${fmt1(dKm)} km` });
      ref = i;
    }
  });

  // first gust ≥ GUST_EVENT_MPS (not at the start: there it is the state, not a change)
  const g = samples.findIndex((s) => (s.weather?.gustMps ?? -Infinity) >= GUST_EVENT_MPS);
  if (g > 0) {
    const v = samples[g].weather!.gustMps!;
    ev.push({ kind: 'gust', ...at(samples[g]), index: g, text: `Böen ab ${Math.round(v * 3.6)} km/h` });
  }

  // switch to headwind with a component ≥ HEADWIND_EVENT_MPS
  let prev: WindRel | null = null;
  samples.forEach((s, i) => {
    const r = windRelationAt(s, points);
    if (!r) return;
    if (prev !== null && r.rel === 'head' && prev !== 'head' && -r.componentMps >= HEADWIND_EVENT_MPS) {
      ev.push({ kind: 'headwind', ...at(s), index: i, text: `Ab hier Gegenwind (${fmt1(-r.componentMps)} m/s)` });
    }
    prev = r.rel;
  });

  return ev.sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));
}

export type ChangeLevel = 'kaum' | 'spürbar' | 'deutlich';
export interface StartFinishDelta {
  tempK: number | null;
  windMps: number | null;
  cloudPct: number | null;
  /** wet share of the last END_SHARE of the route minus that of the first (−1..1). */
  wetShare: number | null;
  level: ChangeLevel;
}

function firstLast(samples: SampleETA[], pick: (s: SampleETA) => number | null | undefined): number | null {
  let a: number | null = null, b: number | null = null;
  for (const s of samples) { const v = pick(s); if (v != null && Number.isFinite(v)) { a = v; break; } }
  for (let i = samples.length - 1; i >= 0; i--) { const v = pick(samples[i]); if (v != null && Number.isFinite(v)) { b = v; break; } }
  return a == null || b == null ? null : b - a;
}

function wetShareIn(samples: SampleETA[], spans: number[], from: number, to: number): number | null {
  let w = 0, all = 0;
  samples.forEach((s, i) => {
    if (s.dist < from || s.dist > to) return;
    const r = s.weather?.precipitationMmH;
    if (r == null) return;
    all += spans[i];
    if (r >= TOUR_WET_MMH) w += spans[i];
  });
  return all > 0 ? w / all : null;
}

export function startFinishDelta(samples: SampleETA[], eventCount: number): StartFinishDelta {
  const tempK = firstLast(samples, (s) => s.weather?.temperatureC);
  const windMps = firstLast(samples, (s) => s.weather?.windSpeedMps);
  const cloudPct = firstLast(samples, (s) => s.weather?.cloudCoverPct);
  let wetShare: number | null = null;
  if (samples.length >= 2) {
    const d0 = samples[0].dist, d1 = samples[samples.length - 1].dist, len = d1 - d0;
    const spans = sampleSpansM(samples);
    const a = wetShareIn(samples, spans, d0, d0 + len * END_SHARE);
    const b = wetShareIn(samples, spans, d1 - len * END_SHARE, d1);
    wetShare = a == null || b == null ? null : b - a;
  }
  const over = (t: { tempK: number; windMps: number; cloudPct: number; wetShare: number }) =>
    (tempK != null && Math.abs(tempK) >= t.tempK) || (windMps != null && Math.abs(windMps) >= t.windMps)
    || (cloudPct != null && Math.abs(cloudPct) >= t.cloudPct) || (wetShare != null && Math.abs(wetShare) >= t.wetShare);
  const level: ChangeLevel = over(CHANGE_STRONG) ? 'deutlich' : over(CHANGE_NOTICEABLE) || eventCount > 0 ? 'spürbar' : 'kaum';
  return { tempK, windMps, cloudPct, wetShare, level };
}

/* ============================ Snapping ============================ */

/** Index of the sample nearest to `distM` (samples sorted by `dist`). -1 for no samples. Values are shown for THIS sample only. */
export function nearestSampleIndex(samples: ReadonlyArray<{ dist: number }>, distM: number): number {
  const n = samples.length;
  if (!n) return -1;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].dist <= distM) lo = mid; else hi = mid;
  }
  return Math.abs(samples[hi].dist - distM) < Math.abs(samples[lo].dist - distM) ? hi : lo;
}

/* ============================ Start window ============================ */

export interface StartWindowRow { offsetMin: number; entry: StartWindowEntry | null; past: boolean }
export interface StartWindowSummary {
  current: StartWindowEntry | null;
  best: StartWindowEntry | null;
  /** A complete entry with fewer wet minutes than the current start exists. */
  betterExists: boolean;
  rows: StartWindowRow[];
}

/**
 * Best start among the COMPLETE entries (coverage ≥ START_COVERAGE_MIN): fewest wet minutes, tie → smaller shift.
 * Entries in the past are not in `startWindow` (the producer drops them); rows mark those offsets as past.
 */
export function summarizeStartWindow(entries: readonly StartWindowEntry[], offsets: readonly number[], startMs: number, nowMs: number): StartWindowSummary {
  const by = new Map(entries.map((e) => [e.offsetMin, e]));
  const current = by.get(0) ?? null;
  let best: StartWindowEntry | null = null;
  for (const e of entries) {
    if (!e.complete) continue;
    if (!best || e.wetMin < best.wetMin || (e.wetMin === best.wetMin && Math.abs(e.offsetMin) < Math.abs(best.offsetMin))) best = e;
  }
  const betterExists = !!best && best.offsetMin !== 0 && (!current || !current.complete || best.wetMin < current.wetMin);
  const rows = offsets.map((o) => ({ offsetMin: o, entry: by.get(o) ?? null, past: startMs + o * 60_000 < nowMs - 60_000 }));
  return { current, best, betterExists, rows };
}

/* ============================ Confidence ============================ */

/** Sample confidence (0..1) to a word. Not the KF scale (V-TE-8): three steps, thresholds `set`. */
export const CONF_HIGH = 0.75;
export const CONF_MID = 0.55;
export type ConfWord = 'hoch' | 'mittel' | 'niedrig';
export function confidenceWord(v: number | null | undefined): ConfWord | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  return v >= CONF_HIGH ? 'hoch' : v >= CONF_MID ? 'mittel' : 'niedrig';
}

/* ============================ Which stand of buscosun Fusion ============================ */

export interface StandLabel {
  /** „buscosun Fusion 14", or the live path. */
  text: string;
  /** null = the current stand everywhere; otherwise the plain-language fallback note. */
  fallback: string | null;
}

/** The stand of ONE sample: the number of its cluster (`meta.clusterFusion[cellId]`). */
export function sampleStand(sample: Pick<SampleETA, 'weather'>, meta: Pick<EnrichmentMeta, 'clusterFusion'> | null | undefined): StandLabel {
  const w = sample.weather;
  if (!w) return { text: '—', fallback: 'kein Wetterwert an diesem Punkt' };
  if (w.validityFlags.includes('fusion_failed')) return { text: '—', fallback: 'Rückfall: für diesen Abschnitt kam keine Vorhersage an' };
  const v = meta?.clusterFusion?.[w.cellId] ?? null;
  if (v == null) return { text: 'Live-Punktvorhersage', fallback: 'Rückfall: Live-Punktvorhersage statt buscosun Fusion' };
  return { text: fusionName(v), fallback: v === FUSION_CURRENT ? null : `Rückfall: ${fusionName(v)} statt ${fusionName(FUSION_CURRENT)}` };
}

/** The stand of the whole result for the sources line. */
export function tourStand(meta: Pick<EnrichmentMeta, 'clusterFusion' | 'pointSource'> | null | undefined): StandLabel {
  const vs = meta?.clusterFusion ?? [];
  const nums = [...new Set(vs.filter((v): v is number => v != null))].sort((a, b) => b - a);
  const live = vs.some((v) => v == null);
  const src: FusionSource | null = meta?.pointSource ?? null;
  if (!nums.length) return { text: src === 'live' || live ? 'Live-Punktvorhersage' : '—', fallback: vs.length ? 'Rückfall: Live-Punktvorhersage statt buscosun Fusion' : null };
  const text = nums.map(fusionName).join(' + ');
  const notes: string[] = [];
  if (nums.some((n) => n !== FUSION_CURRENT)) notes.push(`nicht überall ${fusionName(FUSION_CURRENT)}`);
  if (live) notes.push(`${vs.filter((v) => v == null).length} von ${vs.length} Abschnitten aus der Live-Punktvorhersage`);
  return { text, fallback: notes.length ? `Rückfall: ${notes.join(', ')}` : null };
}

/* ============================ Validity flags in plain language ============================ */

export function flagNotes(flags: readonly string[]): string[] {
  const out: string[] = [];
  if (flags.includes('beyond_horizon')) out.push('Die Ankunft liegt hinter dem Ende der Vorhersage — hier gibt es keinen Wert.');
  if (flags.includes('fusion_failed')) out.push('Für diesen Abschnitt kam keine Vorhersage an.');
  if (flags.includes('radar_override')) out.push('Niederschlag aus dem Radar-Nowcast statt aus dem Modell.');
  if (flags.includes('elevation_corrected')) out.push('Temperatur und Wind auf die Höhe dieses Punkts umgerechnet.');
  if (flags.includes('uv_estimated')) out.push('UV-Index aus Sonnenstand und Bewölkung geschätzt (keine Messquelle).');
  return out;
}
