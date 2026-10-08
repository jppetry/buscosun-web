/**
 * Phase NS: der Rechenteil der Summen-Karte — eigener Lazy-Chunk (`useSumMap` lädt ihn erst in der Ansicht „Summe"),
 * damit das Regenradar ohne Summen-Ansicht kein Byte davon lädt.
 *
 *   Erwartet: Radar-Nowcast DE (RADOLAN-RV) + AT (INCA) aus `getRadarStack` (dieselben Lader wie die Karte), die
 *             Index-Maps Gitter → Quellgitter im Worker der Niederschlagskarte, die kumulierte Erwartung der Kartenfelder
 *             (t1, t2) — nur die Bilder, die das Fenster braucht.
 *   Gefallen: Stationssummen aus `obs/v1` (Punkte); die Fläche ist bis zum Spiegel-Haken (E-NS-1) eine benannte Lücke.
 */
import { getRadarStack, type RadarStack } from '../radar/radarFrames';
import { RADAR_VMAX } from '../radar/radarModel';
import { buildCompositeIndexMap, type GridKind } from '../scalar/precipIndexMap';
import type { QuadCorners } from '../scalar/RainLayer';
import { decodeRgbaPngBrowser } from '../point/client/browserPng';
import { radarWindowSum } from './radarWindowSum';
import { composeFutureSum, emptySumGrid, renderSumRgba, sumGeometry, sumGridAt, FLAG_FIELD, FLAG_RADAR, FLAG_SATURATED, type RadarPart, type SumGridResult } from './sumGrid';
import { loadFieldCumSet, ensureCumImages, cumSpan, type CumTier } from './fieldCum';
import { fetchDataRepo, loadObsCatalog, loadObsLatest, loadObsSeries } from './obsSumStore';
import { stationSumPoints, OBS_RR_SERIES, OBS_SERIES_H, type ObsSeriesDoc, type StationSumPoint, haversineKm } from './obsWindowSum';
import type { SumSelection } from './sumModel';
import type { SumMapInfo } from './sumMapTypes';

export { SumMapLayer } from './sumMapLayer';

const H = 3_600_000;

// --- Index-Maps im Worker der Niederschlagskarte (derselbe Code, `precipIndexWorker.ts`) ---------
let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, (r: Int32Array | null) => void>();
const idxMemo = new Map<string, Promise<Int32Array>>();

function indexMap(corners: QuadCorners, w: number, h: number, grid: GridKind): Promise<Int32Array> {
  const key = `${grid}:${w}x${h}:${corners.flat().join(',')}`;
  const hit = idxMemo.get(key);
  if (hit) return hit;
  const p = new Promise<Int32Array>((resolve) => {
    const sync = () => resolve(buildCompositeIndexMap(corners, w, h, grid));
    if (workerBroken) { sync(); return; }
    try {
      if (!worker) {
        worker = new Worker(new URL('../scalar/precipIndexWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; idxBuf?: ArrayBuffer }>) => {
          const cb = pending.get(e.data.id);
          if (!cb) return;
          pending.delete(e.data.id);
          cb(e.data.ok && e.data.idxBuf ? new Int32Array(e.data.idxBuf) : null);
        };
        worker.onerror = () => { workerBroken = true; for (const [id, cb] of pending) { pending.delete(id); cb(null); } };
      }
      const id = nextId++;
      pending.set(id, (r) => (r ? resolve(r) : sync()));
      worker.postMessage({ id, corners, sCols: w, sRows: h, grid });
    } catch { workerBroken = true; sync(); }
  });
  idxMemo.set(key, p);
  return p;
}

/** Radar-Nowcast eines Landes als Teil der Summe (null ohne Nowcast). */
async function radarPart(stack: RadarStack, nowMs: number, endMs: number): Promise<RadarPart | null> {
  const nowcast = stack.frames.filter((f) => !f.measured && f.leadMinutes > 0);
  if (!nowcast.length) return null;
  const sum = radarWindowSum(nowcast, nowMs, endMs, stack.stepMin, RADAR_VMAX);
  if (!sum) return null;
  const grid: GridKind = stack.source === 'radolan_rv' ? 'radolan' : stack.source === 'inca_grid' ? 'inca' : 'rzc';
  const idx = await indexMap(stack.corners, sum.width, sum.height, grid);
  return { sum, idx, label: stack.sourceLabel };
}

export interface SumMapResult {
  info: SumMapInfo;
  rgba: { data: Uint8ClampedArray; width: number; height: number };
  points: StationSumPoint[];
  grid: SumGridResult;
}

/** Eine Rechnung der Summen-Karte für Richtung und Fenster (s. Kopf). */
export async function computeSumMap(dir: SumSelection['dir'], windowH: number, nowMs: number): Promise<SumMapResult> {
  const endMs = nowMs + windowH * H;
  const geom = sumGeometry();
  if (dir === 'future') {
    const [de, at, cumSet] = await Promise.all([
      getRadarStack('DE').catch(() => null),
      getRadarStack('AT').catch(() => null),
      loadFieldCumSet((p) => fetchDataRepo(p, 'json')).catch((e) => ({ tiers: [] as CumTier[], notes: [`Kartenfelder nicht erreichbar (${e instanceof Error ? e.message : String(e)})`] })),
    ]);
    const [rpDe, rpAt] = await Promise.all([de ? radarPart(de, nowMs, endMs) : null, at ? radarPart(at, nowMs, endMs) : null]);
    // Bilder nur für die Zeitpunkte, die das Fenster braucht.
    const times = [nowMs, endMs, ...(rpDe ? [rpDe.sum.coveredToMs] : []), ...(rpAt ? [rpAt.sum.coveredToMs] : [])];
    for (const t of cumSet.tiers) { const sp = cumSpan(t); if (sp) times.push(sp.toMs); }
    await Promise.all(cumSet.tiers.map((t) => ensureCumImages(t, times.filter((x) => x <= endMs), (p) => fetchDataRepo(p, 'bytes') as Promise<Uint8Array>, decodeRgbaPngBrowser)));
    const grid = composeFutureSum({ geom, nowMs, endMs, radar: [rpDe, rpAt, null], cum: cumSet.tiers });
    return {
      grid, points: [], rgba: renderSumRgba(grid),
      info: {
        status: 'ready', dir: 'future', windowH, nowMs,
        radar: [
          rpDe && de ? { label: rpDe.label, runAtMs: de.runAtMs, toMs: rpDe.sum.coveredToMs } : null,
          rpAt ? { label: rpAt.label, runAtMs: null, toMs: rpAt.sum.coveredToMs } : null,
        ].filter((x): x is { label: string; runAtMs: number | null; toMs: number } => !!x),
        field: cumSet.tiers.map((t) => ({ run: t.run, runAtMs: t.runAtMs, tier: t.tier, fusionName: t.fusionName })),
        fieldNotes: cumSet.notes,
        stats: grid.stats, stations: 0, stationsEndMs: null, stationNote: null,
      },
    };
  }
  const grid = emptySumGrid(geom);
  let points: StationSumPoint[] = [];
  let note: string | null = null;
  if (windowH > OBS_SERIES_H - 1) note = `Stationsreihen reichen ${OBS_SERIES_H} h — für ${windowH} h gibt es noch keine gemessene Quelle`;
  else {
    try {
      const [cat, latest] = await Promise.all([loadObsCatalog(), loadObsLatest()]);
      const docs = await Promise.all(OBS_RR_SERIES.map((s) => loadObsSeries(s).then((d) => [s, d] as const).catch(() => null)));
      const series: Record<string, ObsSeriesDoc> = Object.fromEntries(docs.filter((d): d is readonly [typeof OBS_RR_SERIES[number], ObsSeriesDoc] => !!d));
      points = stationSumPoints(cat, latest.stations, series, windowH, Date.now());
    } catch (e) { note = `Stationsmessungen nicht erreichbar (${e instanceof Error ? e.message : String(e)})`; }
  }
  return {
    grid, points, rgba: renderSumRgba(grid),
    info: {
      status: 'ready', dir: 'past', windowH, nowMs, radar: [], field: [], fieldNotes: [], stats: grid.stats,
      stations: points.length, stationsEndMs: points.length ? Math.max(...points.map((p) => p.endMs)) : null, stationNote: note,
    },
  };
}

/** Hover-Text: Station unter dem Zeiger (≤ 2 km, gemessen) zuerst, sonst die Zelle des Gitters. */
export function sumHoverText(r: Pick<SumMapResult, 'grid' | 'points'>, lat: number, lon: number): string | null {
  let best: StationSumPoint | null = null, bd = 2;
  for (const p of r.points) {
    if (Math.abs(p.lat - lat) > 0.05 || Math.abs(p.lon - lon) > 0.08) continue;
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return `${best.name}: ${best.mm.toFixed(1).replace('.', ',')} mm gemessen`;
  const v = sumGridAt(r.grid, lat, lon);
  if (!v) return null;
  if (v.mm == null) return 'keine Daten';
  const src = (v.flags & FLAG_RADAR) && (v.flags & FLAG_FIELD) ? 'Radar + buscosun Fusion' : (v.flags & FLAG_RADAR) ? 'Radar-Nowcast' : 'buscosun Fusion';
  const amount = v.mm < 0.1 ? '< 0,1 mm' : `${v.flags & FLAG_SATURATED ? 'mindestens ' : 'etwa '}${v.mm < 10 ? v.mm.toFixed(1).replace('.', ',') : Math.round(v.mm)} mm`;
  return `${amount} · ${src}`;
}
