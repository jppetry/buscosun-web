/**
 * Phase NC (`audit/radar-nowcast-dach.md` §5) — client readers of the two derived nowcast products of the mirror
 * (contract `radarNowcastImg.ts`): the CH extrapolation `rzc-nc/<stamp>/` and the INCA run refined to 5 min
 * `inca-5m/<stamp>/`. Image way only (the products exist nowhere else); every failure answers `null` and the caller keeps
 * what it had before Phase NC (the rzc analysis alone, INCA by lead) — rule 2. Off with `?nc=0`.
 */

import type { QuadCorners } from '../scalar/RainLayer';
import { radarDualFlagFrom } from '../scalar/radarHd';
import { shareInFlight } from './shareInFlight';
import { radarCdnEnabled, radarCdnUsable, radarImgEnabled, noteRadarCdnFailure, radarCdnDeadline } from './radolanRuns';
import { fetchImgRes, RadarImg404, radarRawHedgeCount, RADAR_IMG_CONCURRENCY, pooledAll, radarImgStamp, radarImgStampToMs } from './radarImg';
import { loadRadarGrayPngOffMain, loadRadarGrayAlphaPngOffMain } from './radolan';
import {
  radarNcFlagFrom, rzcNcImgDir, inca5mImgDir, parseRzcNcImgMeta, parseInca5mImgMeta, NC_STEP_MIN,
  type NcMotion, type RzcNcImgMeta, type Inca5mImgMeta,
} from './radarNowcastImg';

export interface RzcNcFrame {
  leadMinutes: number;
  validAt: Date;
  values: Uint8Array;
  values2?: Uint8Array;
  /** 255 = unknown (rain could come from beyond the radar grid) — drawn as a grey veil, never as dry. */
  unknown: Uint8Array;
  width: number;
  height: number;
}

export interface RzcNowcast {
  stamp: string;
  analysisAt: Date;
  corners: QuadCorners;
  frames: RzcNcFrame[];
  motion: NcMotion;
  series: string[];
  caveats: string[];
  label: string;
}

export interface Inca5mFrameData {
  leadMinutes: number;
  validAt: Date;
  kind: 'inca' | 'between';
  values: Uint8Array;
  values2?: Uint8Array;
  width: number;
  height: number;
}

export interface Inca5mGrid {
  stamp: string;
  refAt: Date;
  corners: QuadCorners;
  frames: Inca5mFrameData[];
  label: string;
  note: string;
}

export interface NcFetchOptions { priority?: RequestPriority }

const cdnOk = () => radarNcFlagFrom() && radarCdnEnabled() && radarCdnUsable() && radarImgEnabled();

/** The meta of a slot as JSON; an answer that is not JSON (an HTML fallback page for a missing path) counts as "not there". */
async function metaJson(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (!/json/i.test(ct)) throw new RadarImg404(`kein JSON (${ct || 'ohne Typ'}): ${res.url}`);
  try { return await res.json(); } catch { throw new RadarImg404(`unlesbares JSON: ${res.url}`); }
}

/** One slot's frames: dual `g` when the slot carries it (and the switch allows), else `f`; unknown masks for rzc-nc. */
async function readFrames(dir: string, meta: RzcNcImgMeta | Inca5mImgMeta, signal: AbortSignal, priority?: RequestPriority, touch?: () => void) {
  const dualFile = radarDualFlagFrom() && meta.dual ? new Map(meta.dual.frames.map((d) => [d.lead, d.file])) : null;
  const hedges0 = radarRawHedgeCount();
  const limit = () => (radarRawHedgeCount() > hedges0 ? Number.POSITIVE_INFINITY : RADAR_IMG_CONCURRENCY);
  return pooledAll(meta.frames, limit, async (f) => {
    const g = dualFile?.get(f.lead);
    if (g) {
      try {
        const d = await loadRadarGrayAlphaPngOffMain(await fetchImgRes(`${dir}/${g}`, signal, priority), meta.width, meta.height);
        return { lead: f.lead, values: d.values, values2: d.values2 };
      } catch (err) { if (!(err instanceof RadarImg404)) throw err; }
    }
    return { lead: f.lead, values: await loadRadarGrayPngOffMain(await fetchImgRes(`${dir}/${f.file}`, signal, priority), meta.width, meta.height), values2: undefined };
  }, touch);
}

async function loadRzcNcSlot(stamp: string, signal: AbortSignal, priority?: RequestPriority, touch?: () => void): Promise<RzcNowcast | null> {
  const dir = rzcNcImgDir(stamp);
  const meta = parseRzcNcImgMeta(await metaJson(await fetchImgRes(`${dir}/meta.json`, signal, priority)));
  if (!meta || meta.stamp !== stamp) return null;
  touch?.();
  const planes = await readFrames(dir, meta, signal, priority, touch);
  const hedges0 = radarRawHedgeCount();
  const unknown = await pooledAll(meta.unknown, () => (radarRawHedgeCount() > hedges0 ? Number.POSITIVE_INFINITY : RADAR_IMG_CONCURRENCY),
    async (u) => loadRadarGrayPngOffMain(await fetchImgRes(`${dir}/${u.file}`, signal, priority), meta.width, meta.height), touch);
  const frames: RzcNcFrame[] = meta.frames.map((f, i) => ({
    leadMinutes: f.lead, validAt: new Date(f.validAtMs ?? meta.analysisAtMs + f.lead * 60_000),
    values: planes[i].values, ...(planes[i].values2 ? { values2: planes[i].values2 } : {}), unknown: unknown[i],
    width: meta.width, height: meta.height,
  }));
  return { stamp, analysisAt: new Date(meta.analysisAtMs), corners: meta.corners, frames, motion: meta.motion, series: meta.series, caveats: meta.caveats, label: meta.label };
}

/**
 * The CH extrapolation that starts from the rzc analysis `analysisStamp` (the one the map holds); when that slot has no
 * product yet (the mirror derives it with the analysis, a direct-STAC analysis can be one slot ahead), the previous slot —
 * its frames are picked by validity time anyway. `null` = none (as before Phase NC).
 */
export async function fetchRzcNowcast(analysisStamp: string, signal?: AbortSignal, opts?: NcFetchOptions): Promise<RzcNowcast | null> {
  if (!cdnOk()) return null;
  return shareInFlight(`rzc-nc:${analysisStamp}`, async () => {
    const ms0 = radarImgStampToMs(analysisStamp);
    const stamps = Number.isFinite(ms0) ? [analysisStamp, radarImgStamp(ms0 - NC_STEP_MIN * 60_000), radarImgStamp(ms0 - 2 * NC_STEP_MIN * 60_000)] : [analysisStamp];
    for (const stamp of stamps) {
      const dl = radarCdnDeadline(undefined);
      try {
        const nc = await loadRzcNcSlot(stamp, dl.signal, opts?.priority, dl.touch);
        if (!nc) continue;
        console.log(`[buscosun] CH Hochrechnung → Slot ${stamp} · ${nc.frames.length} Frames (+5…+120 min) · ${nc.motion.speedKmh} km/h aus ${nc.motion.fromDeg ?? '—'}° (${nc.motion.pairs} Paare) · Quelle Daten-Repo (PNG)`);
        return nc;
      } catch (err) {
        if (err instanceof RadarImg404) continue;
        noteRadarCdnFailure();
        return null;
      } finally { dl.done(); }
    }
    return null;
  }, signal);
}

async function loadInca5mSlot(stamp: string, signal: AbortSignal, priority?: RequestPriority, touch?: () => void): Promise<Inca5mGrid | null> {
  const dir = inca5mImgDir(stamp);
  const meta = parseInca5mImgMeta(await metaJson(await fetchImgRes(`${dir}/meta.json`, signal, priority)));
  if (!meta || meta.stamp !== stamp) return null;
  touch?.();
  const planes = await readFrames(dir, meta, signal, priority, touch);
  const frames: Inca5mFrameData[] = meta.frames.map((f, i) => ({
    leadMinutes: f.lead, validAt: new Date(f.validAtMs), kind: f.kind,
    values: planes[i].values, ...(planes[i].values2 ? { values2: planes[i].values2 } : {}), width: meta.width, height: meta.height,
  }));
  return { stamp, refAt: new Date(meta.refAtMs), corners: meta.corners, frames, label: meta.label, note: meta.note };
}

/**
 * The INCA run `runStamp` (reftime) refined to 5 min; `runStamp` null = the run is not known (direct-API path) ⇒ the two
 * newest 15-min reftimes that are surely mirrored are tried. `null` = none (INCA by lead as before Phase NC).
 */
export async function fetchInca5m(runStamp: string | null, signal?: AbortSignal, opts?: NcFetchOptions): Promise<Inca5mGrid | null> {
  if (!cdnOk()) return null;
  const key = runStamp ?? 'guess';
  return shareInFlight(`inca-5m:${key}`, async () => {
    const stamps = runStamp ? [runStamp] : guessRunStamps(2);
    for (const stamp of stamps) {
      const dl = radarCdnDeadline(undefined);
      try {
        const g = await loadInca5mSlot(stamp, dl.signal, opts?.priority, dl.touch);
        if (!g) continue;
        console.log(`[buscosun] AT INCA · 5 min → Lauf ${stamp} · ${g.frames.length} Frames (+15…+180 min, ${g.frames.filter((f) => f.kind === 'inca').length} INCA-Bilder) · Quelle Daten-Repo (PNG)`);
        return g;
      } catch (err) {
        if (err instanceof RadarImg404) continue;
        noteRadarCdnFailure();
        return null;
      } finally { dl.done(); }
    }
    return null;
  }, signal);
}

/** Like `guessIncaStamps` (geosphereIncaGrid.ts): the newest 15-min reftimes that the mirror surely holds (28-min gate). */
function guessRunStamps(count: number, nowMs: number = Date.now()): string[] {
  const step = 15 * 60_000, gate = 28 * 60_000;
  const newest = Math.floor((nowMs - gate) / step) * step;
  return Array.from({ length: count }, (_, i) => radarImgStamp(newest - i * step));
}
