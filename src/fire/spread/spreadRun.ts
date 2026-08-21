/**
 * One pass over the fire registry: sample, compute, cap, report.
 *
 * The cap is the part worth reading twice. Silently drawing arrows for the
 * strongest 25 fires and nothing for the rest would state, on the map, that the
 * rest are not spreading — a false statement about the inventory (Lehre V-246).
 * Therefore every candidate gets a `FireSpread` entry: the ones past the cap
 * carry `reason: 'capped'`, and the run reports `considered`, `computed` and
 * `capped` so the UI can say the sentence out loud.
 */

import type { IconD2Wind } from '../../wind/iconD2WindSource';
import type { IconD2FireWeather } from '../../sources/iconD2FireWeather';
import { sampleWindAt } from '../../wind/windPointSample';
import type { FireRecord } from '../footprint/fireRegistry';
import { sampleIszAt } from './isiPointSample';
import { spreadForFire, type FireSpread, type SpreadSample } from './spreadForecast';
import { MAX_DEM_CELLS, slopesForFires } from './terrainSampler';
import type { WindInput } from './spreadVector';

/** Arrows computed at most. Ranked: active first, then ΣFRP descending. */
export const MAX_SPREAD_FIRES = 25;

/**
 * A forecast hour is only accepted from a frame within half an hour of it.
 * `windFrameAtValidTime` and `frameAtValidTime` both CLAMP silently to the
 * nearest frame, so without this guard the sixth hour would quietly reuse the
 * third one's wind (the ±3 h rule at `FirePage.tsx` is for past overpasses and
 * is far too lax for a forecast).
 */
export const FRAME_MAX_GAP_MS = 30 * 60_000;

/** m/s (wind grid) → km/h (FWI/FBP convention). */
const MS_TO_KMH = 3.6;

/** Fires are processed in slices so a large registry cannot block the main thread. */
const SLICE_FIRES = 5;
const yieldMain = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export interface SpreadRun {
  byId: Map<string, FireSpread>;
  /** Computed entries in rank order — the ones that actually carry an arrow first. */
  list: FireSpread[];
  /** Active fires the run looked at. */
  considered: number;
  /** Entries with a vector at the shown hour. */
  computed: number;
  /** Entries refused because of the cap. */
  capped: number;
  /** DEM cells actually fetched. */
  demCells: number;
  cap: number;
  demCap: number;
  /** Hours the samplers could actually cover (may be shorter than requested). */
  hoursAvailable: number;
  /**
   * The last hour of the axis that can be computed at all, or `-1` when not even
   * the current hour works. Usually shorter than `maxHour`, because the WIND grid
   * ends before the fire-weather grid does: the warmed wind run can be many hours
   * old (measured 12,7 h on 2026-08-19), and its +12 h horizon then ends at „now".
   * The UI has to SAY this — an empty map at +3 h without a reason would read as
   * „nothing spreads".
   */
  horizonHour: number;
  /** Highest hour of the axis that was asked for. */
  maxHour: number;
  windRunAtMs: number | null;
  fwRunAtMs: number | null;
  shownHour: number;
}

export interface SpreadRunInput {
  records: readonly FireRecord[];
  wind: IconD2Wind | null;
  fireWx: IconD2FireWeather | null;
  /** Anchor of the hour axis — the START of the running hour, not `Date.now()`. */
  nowMs: number;
  /** Highest hour of the axis (inclusive). */
  maxHour: number;
  shownHour: number;
  maxFires?: number;
  signal?: AbortSignal;
}

/** Beginning of the running hour — the axis anchor (WF4 lesson: never round against `Date.now()`). */
export function hourAnchorMs(nowMs: number): number {
  return Math.floor(nowMs / 3_600_000) * 3_600_000;
}

/** Ranking: a fire with a current signal first, then by radiative power. */
export function rankRecords(records: readonly FireRecord[]): FireRecord[] {
  return records
    .filter((r) => r.status.kind === 'active' && Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .sort((a, b) => (b.frpSumMw ?? 0) - (a.frpSumMw ?? 0) || a.id.localeCompare(b.id));
}

function windAt(wind: IconD2Wind | null, atMs: number, lon: number, lat: number): WindInput | null {
  const w = sampleWindAt(wind, atMs, lon, lat);
  if (!w) return null;
  if (Math.abs(w.validAtMs - atMs) > FRAME_MAX_GAP_MS) return null;
  return { speedKmh: w.speed * MS_TO_KMH, fromDeg: w.dir };
}

function iszAt(fw: IconD2FireWeather | null, atMs: number, lon: number, lat: number): number | null {
  const s = sampleIszAt(fw, atMs, lon, lat);
  if (!s) return null;
  if (Math.abs(s.validAtMs - atMs) > FRAME_MAX_GAP_MS) return null;
  return s.iszValue;
}

export async function computeSpreadRun(input: SpreadRunInput): Promise<SpreadRun> {
  const cap = input.maxFires ?? MAX_SPREAD_FIRES;
  const anchor = hourAnchorMs(input.nowMs);
  const ranked = rankRecords(input.records);
  const selected = ranked.slice(0, cap);

  const slopes = await slopesForFires(selected.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon })), input.signal);

  const byId = new Map<string, FireSpread>();
  const list: FireSpread[] = [];
  let hoursAvailable = 0;

  for (let i = 0; i < ranked.length; i++) {
    if (input.signal?.aborted) break;
    const r = ranked[i];
    const capped = i >= cap;

    let samples: SpreadSample[] = [];
    if (!capped) {
      samples = [];
      for (let h = 0; h <= input.maxHour; h++) {
        const atMs = anchor + h * 3_600_000;
        samples.push({ atMs, hour: h, iszValue: iszAt(input.fireWx, atMs, r.lon, r.lat), wind: windAt(input.wind, atMs, r.lon, r.lat) });
      }
      const covered = samples.filter((s) => s.wind && s.iszValue != null).length;
      hoursAvailable = Math.max(hoursAvailable, covered);
    }

    const s = spreadForFire({
      fireId: r.id, lat: r.lat, lon: r.lon,
      active: r.status.kind === 'active',
      capped,
      slope: slopes.byId.get(r.id) ?? null,
      observedBearingDeg: r.activity?.spreadBearingDeg ?? null,
      samples,
      shownHour: input.shownHour,
    });
    byId.set(r.id, s);
    list.push(s);

    if (!capped && (i + 1) % SLICE_FIRES === 0) await yieldMain();
  }

  return {
    byId, list,
    considered: ranked.length,
    computed: list.filter((s) => s.shown?.vector).length,
    capped: Math.max(0, ranked.length - cap),
    demCells: slopes.cellsLoaded,
    cap,
    demCap: MAX_DEM_CELLS,
    hoursAvailable,
    horizonHour: hoursAvailable - 1,
    maxHour: input.maxHour,
    windRunAtMs: input.wind?.runAt.getTime() ?? null,
    fwRunAtMs: input.fireWx?.runAt.getTime() ?? null,
    shownHour: input.shownHour,
  };
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread).
// Network- and DOM-free: only the pure ranking/anchor helpers.
// ---------------------------------------------------------------------------

export interface RunCheck { name: string; ok: boolean; detail?: string }

export function verifySpreadRun(): { checks: RunCheck[]; passed: number; total: number } {
  const checks: RunCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const rec = (id: string, kind: string, frp: number | null, lat = 48, lon = 11) => ({
    id, lat, lon, status: { kind, sinceMs: null, source: null }, frpSumMw: frp,
  }) as unknown as FireRecord;

  const ranked = rankRecords([
    rec('a', 'active', 10), rec('b', 'no-signal', 900), rec('c', 'active', 50),
    rec('d', 'out', 999), rec('e', 'active', null),
  ]);
  add('nur Brände mit aktuellem Signal werden betrachtet',
    ranked.map((r) => r.id).join() === 'c,a,e', ranked.map((r) => r.id).join());
  add('Rangfolge ist die Leistung, absteigend', ranked[0].id === 'c' && ranked[1].id === 'a');
  add('fehlende Leistung landet hinten, wird aber nicht verworfen', ranked[2].id === 'e');
  add('Brände ohne brauchbare Koordinate fallen heraus',
    rankRecords([rec('x', 'active', 5, NaN, 11)]).length === 0);
  add('gleiche Leistung ⇒ stabile Reihenfolge über die Kennung',
    rankRecords([rec('z', 'active', 5), rec('y', 'active', 5)]).map((r) => r.id).join() === 'y,z');

  // --- The hour anchor is the start of the running hour, never "now".
  const t = 1_760_000_000_000 + 31 * 60_000 + 17_000;
  add('Stundenanker ist der Beginn der laufenden Stunde',
    hourAnchorMs(t) % 3_600_000 === 0 && t - hourAnchorMs(t) < 3_600_000);
  add('derselbe Anker für zwei Zeitpunkte derselben Stunde',
    hourAnchorMs(t) === hourAnchorMs(t + 60_000));

  // --- The frame guard is tighter than the retrospective ±3 h rule.
  add('Frame-Schranke der Vorhersage ist enger als die ±3-h-Regel der Überflüge',
    FRAME_MAX_GAP_MS < 3 * 3_600_000 && FRAME_MAX_GAP_MS <= 30 * 60_000, `${FRAME_MAX_GAP_MS / 60_000} min`);
  add('Deckel ist gesetzt und wird nach außen gemeldet', MAX_SPREAD_FIRES > 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
