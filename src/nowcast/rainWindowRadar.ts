/**
 * Phase RB: radar minute at the point for the rain window (`rainWindow.ts`).
 *
 * Reads the frames of the stack the map already holds at the point — the same reading as the point strip
 * (`sampleRadarPoint`, 1 km, wet = 0,1 mm/h like the hero): RADOLAN-RV (DE) and INCA (AT) are extrapolations with
 * frames ⇒ first wet / first dry minute; MeteoSwiss rzc (CH) is one analysis ⇒ only "wet now".
 * The flow ensemble (`ml/flowEnsemble.ts`) is NOT used: its Horn–Schunck field is ≈ 0 at a dry point ahead of the rain
 * and about half the true speed inside the echo (V-RB-4, `audit/regenbeginn-spanne.md` §5), so it misses approaching
 * rain. No flow, no extra pass — cost is one point lookup per frame.
 */
import { sampleRadarPoint } from '../pointForecast/radarSample';
import type { RadarStack } from '../radar/radarFrames';
import type { RadarTimes } from './rainWindow';

/** u8 convention of the radar frames: value/255 · 20 mm/h (`RADAR_VMAX`) — local so the module stays headless. */
const RADAR_VMAX = 20;
/** Wet = 0,1 mm/h, the hero's threshold (`WET_MMH`). */
export const RB_WET_MMH = 0.1;

/**
 * Radar at (lat, lon). `nowMs` shifts the leads onto "now" (the run lies a few minutes back); `null` when the stack
 * has no frame ahead or the point lies outside the radar grid.
 */
export function radarTimesAt(stack: RadarStack, lat: number, lon: number, nowMs: number): RadarTimes | null {
  const fut = stack.frames.filter((f) => f.leadMinutes >= 0).sort((a, b) => a.leadMinutes - b.leadMinutes);
  if (!fut.length) return null;
  const vals = fut.map((f) => sampleRadarPoint(stack.source, f.values, f.width, f.height, stack.corners, lat, lon, RADAR_VMAX));
  if (vals[0] == null) return null;
  const shift = (nowMs - stack.runAtMs) / 60_000;
  const rel = (lead: number) => lead - shift;
  // "now" = the frame nearest to now
  let iNow = 0;
  for (let i = 1; i < fut.length; i++) if (Math.abs(rel(fut[i].leadMinutes)) < Math.abs(rel(fut[iNow].leadMinutes))) iNow = i;
  const wet = (i: number) => (vals[i] ?? 0) >= RB_WET_MMH;
  const wetNow = wet(iNow);
  const product: RadarTimes['product'] = stack.source === 'radolan_rv' ? 'RADOLAN-RV' : stack.source === 'inca_grid' ? 'INCA' : 'rzc';
  if (stack.source === 'meteoswiss_rzc') return { kind: 'analysis', product, horizonMin: 0, wetNow, onsetMin: null, endMin: null };
  const lastLead = fut[fut.length - 1].leadMinutes;
  const horizonMin = Math.max(0, Math.round(rel(Math.min(stack.skillMin || lastLead, lastLead))));
  let first: number | null = null;
  for (let i = iNow + 1; i < fut.length; i++) {
    const r = rel(fut[i].leadMinutes);
    if (r > horizonMin) break;
    if (wet(i) !== wetNow) { first = Math.max(0, Math.round(r)); break; }
  }
  return { kind: 'extrapolation', product, horizonMin, wetNow, onsetMin: wetNow ? null : first, endMin: wetNow ? first : null };
}
