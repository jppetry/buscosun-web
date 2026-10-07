/**
 * fusionForecast.ts — the ONE entry of the platform into buscosun Fusion (phase FR-2, `audit/fusion-release.md` §8).
 *
 * Route planner, event planner, cross section / 3D / foehn and notifications used to call the live path (`getPointForecast`
 * without `pointSource`), where there is no stage and therefore no stand of buscosun Fusion: a new stand never reached them.
 * They call `getFusionForecast(opts, part)` now. A part that is switched on in the register (`FUSION_PARTS`) computes the
 * stage `fs` on the point cube — the newest stand, the same chain as point panel, dashboard and radar strip, so a new stand
 * reaches it by itself — with the radar (stands 8/9 need it) and, in Germany, the DWD UV forecast the cube does not carry
 * (E-FR-4). A part that is off calls `getPointForecast(opts)` EXACTLY as before (byte-identical). The cube path failing
 * (anything but an abort) falls back to that same live call, with a console line.
 *
 * `cubeSource` is never imported statically (R8: the start chunk stays free of point modules); it registers itself when loaded.
 */
import { getPointForecast, singleSourceConfidence, type PointForecastOptions } from './pointForecast';
import type { PointForecast } from './types';
import { pfForceFrom } from './pfFlags';
import { FUSION_PARTS, fusionPartOn, type FusionPartId } from './fusion/fusionRelease';
import { fetchDwdUvPoint, type UvPointHour } from '../sources/dwdUvForecast';
import { COUNTRY_PROFILES } from '../countryProfiles';

const H = 3_600_000;

export type FusionPath = 'cube' | 'live';

/** The path a part takes: `?pf=live` / `?pf=cube` first, then the register. Pure (no `window`) for the verifier. */
export function fusionPathFor(part: FusionPartId, search: string, on: boolean = fusionPartOn(part)): FusionPath {
  return pfForceFrom(search) ?? (on ? 'cube' : 'live');
}

/**
 * The DWD UV in the hours of a cube forecast that carry none (E-FR-4) — value and confidence as the live path gives a single
 * source (`singleSourceConfidence`), provenance in `sourcesAvailable` (`dwd_uv`) and `cube.uv`. Returns a NEW object: the
 * input belongs to the cube cache that point panel and dashboard share and is not touched. No UV value ⇒ the input itself.
 */
export function withDwdUv(fc: PointForecast, uv: readonly UvPointHour[], nowMs: number = Date.now()): PointForecast {
  const byT = new Map<number, number>();
  for (const u of uv) if (u.uvIndex != null && Number.isFinite(u.uvIndex)) byT.set(u.time.getTime(), u.uvIndex);
  if (!byT.size) return fc;
  const t0 = Math.floor(nowMs / H) * H;
  let filled = 0;
  const hours = fc.hours.map((h) => {
    if (h.uvIndex != null) return h;
    const v = byT.get(h.timestamp.getTime());
    if (v == null) return h;
    filled++;
    const lead = Math.max(0, Math.round((h.timestamp.getTime() - t0) / H));
    return { ...h, uvIndex: v, confidence: { ...h.confidence, uvIndex: singleSourceConfidence('uvIndex', lead) } };
  });
  if (!filled) return fc;
  return {
    ...fc,
    hours,
    sourcesAvailable: fc.sourcesAvailable.includes('dwd_uv') ? fc.sourcesAvailable : [...fc.sourcesAvailable, 'dwd_uv'],
    cube: { ...(fc.cube ?? {}), uv: { source: 'dwd_uv', hours: filled, text: 'UV-Index aus der DWD-UV-Vorhersage (Tagesspitze per Sonnenstand auf die Stunde verteilt), wie im Live-Pfad' } },
  };
}

export interface FusionForecastExtra {
  /** Forces the path (measurement, verifier); without it `?pf=` and the register decide. */
  path?: FusionPath;
}

/** The point forecast of a part of the platform — buscosun Fusion in its newest stand when the part is on (see the head). */
export async function getFusionForecast(opts: PointForecastOptions, part: FusionPartId, extra: FusionForecastExtra = {}): Promise<PointForecast> {
  const search = typeof window !== 'undefined' ? window.location?.search ?? '' : '';
  if ((extra.path ?? fusionPathFor(part, search)) === 'live') return getPointForecast(opts);

  const { lat, lng, country, signal } = opts;
  const hours = opts.hours ?? COUNTRY_PROFILES[country].forecastHours;
  const uvP: Promise<UvPointHour[]> = country === 'DE' ? fetchDwdUvPoint(lat, lng, hours, signal).catch(() => []) : Promise.resolve([]);
  const up = opts.onUpdate;
  try {
    await import('./cubeSource');
    const fc = await getPointForecast({
      ...opts, hours, includeRadarNowcast: true, pointSource: 'cube',
      onUpdate: up ? (next) => { void uvP.then((uv) => { if (!signal?.aborted) up(withDwdUv(next, uv)); }); } : undefined,
    });
    return withDwdUv(fc, await uvP);
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError' || signal?.aborted) throw err;
    const why = err instanceof Error ? err.message : String(err);
    const name = FUSION_PARTS.find((p) => p.id === part)?.name ?? part;
    console.warn(`[buscosun Fusion] ${name}: Cube-Pfad gescheitert (${why}) — Rückfall auf den Live-Pfad`);
    return getPointForecast(opts);
  }
}
