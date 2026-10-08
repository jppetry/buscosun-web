/**
 * Phase NS: der Rechenteil der Summen-Karte — eigener Lazy-Chunk (`useSumMap` lädt ihn erst in der Ansicht „Summe"),
 * damit das Regenradar ohne Summen-Ansicht kein Byte davon lädt.
 *
 *   Erwartet: Radar-Nowcast DE (RADOLAN-RV) + AT (INCA) aus `getRadarStack` (dieselben Lader wie die Karte), die
 *             Index-Maps Gitter → Quellgitter im Worker der Niederschlagskarte, die kumulierte Erwartung der Kartenfelder
 *             (t1, t2) — nur die Bilder, die das Fenster braucht.
 *   Gefallen: die amtliche, angeeichte Flächensumme aus `precipsum/v1` (DE RW · AT INCA · CH CombiPrecip, Stufe B2/B3)
 *             und darüber die Stationssummen aus `obs/v1` (Punkte); ohne Produkt ist die Fläche eine benannte Lücke.
 */
import { getRadarStack, type RadarStack } from '../radar/radarFrames';
import { RADAR_VMAX } from '../radar/radarModel';
import { buildCompositeIndexMap, type GridKind } from '../scalar/precipIndexMap';
import type { QuadCorners } from '../scalar/RainLayer';
import { decodeRgbaPngBrowser } from '../point/client/browserPng';
import { radarWindowSum } from './radarWindowSum';
import { composeFutureSum, emptySumGrid, pastSumGridFromRgba, renderSumRgba, sumGeometry, sumGridAt, FLAG_FIELD, FLAG_MEASURED, FLAG_OUTSIDE, FLAG_RADAR, FLAG_SATURATED, type RadarPart, type SumGridResult } from './sumGrid';
import { PAST_SUM_COUNTRIES, PAST_SUM_DE_DAILY, PAST_SUM_DIR, PAST_SUM_SOURCES, PAST_SUM_STALE_MS, parsePastSumManifest, type PastSumManifest } from './pastSumFormat';
import { loadFieldCumSet, ensureCumImages, cumSpan, type CumTier } from './fieldCum';
import { fetchDataRepo, loadObsCatalog, loadObsLatest, loadObsSeries, memoized } from './obsSumStore';
import { stationSumPoints, OBS_RR_SERIES, OBS_SERIES_H, type ObsSeriesDoc, type StationSumPoint, haversineKm } from './obsWindowSum';
import type { SumSelection } from './sumModel';
import type { SumMapInfo } from './sumMapTypes';
import { fmtHour } from './sumModel';

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
        stats: grid.stats, stations: 0, stationsEndMs: null, stationNote: null, measured: null, measuredNote: null,
      },
    };
  }
  let points: StationSumPoint[] = [];
  let note: string | null = null;
  const stationsP = (async () => {
    if (windowH > OBS_SERIES_H - 1) { note = `Stationsreihen reichen ${OBS_SERIES_H} h — Punkte nur bis 24 h`; return; }
    try {
      const [cat, latest] = await Promise.all([loadObsCatalog(), loadObsLatest()]);
      const docs = await Promise.all(OBS_RR_SERIES.map((s) => loadObsSeries(s).then((d) => [s, d] as const).catch(() => null)));
      const series: Record<string, ObsSeriesDoc> = Object.fromEntries(docs.filter((d): d is readonly [typeof OBS_RR_SERIES[number], ObsSeriesDoc] => !!d));
      points = stationSumPoints(cat, latest.stations, series, windowH, Date.now());
    } catch (e) { note = `Stationsmessungen nicht erreichbar (${e instanceof Error ? e.message : String(e)})`; }
  })();
  const [area] = await Promise.all([loadPastArea(windowH, geom, nowMs), stationsP]);
  const grid = area.grid ?? emptySumGrid(geom);
  return {
    grid, points, rgba: renderSumRgba(grid),
    info: {
      status: 'ready', dir: 'past', windowH, nowMs, radar: [], field: [], fieldNotes: [], stats: grid.stats,
      stations: points.length, stationsEndMs: points.length ? Math.max(...points.map((p) => p.endMs)) : null, stationNote: note,
      measured: area.measured, measuredNote: area.note,
    },
  };
}

// --- Gefallen: amtliche Flächensumme (precipsum/v1) -------------------------------------------------

function loadPastManifest(): Promise<PastSumManifest> {
  return memoized('precipsum:latest', 'latest', async () => parsePastSumManifest(await fetchDataRepo(`${PAST_SUM_DIR}/latest.json`, 'json')));
}

async function loadPastArea(windowH: number, geom: ReturnType<typeof sumGeometry>, nowMs: number): Promise<{ grid: SumGridResult | null; measured: SumMapInfo['measured']; note: string | null }> {
  let m: PastSumManifest;
  try { m = await loadPastManifest(); }
  catch (e) { return { grid: null, measured: null, note: `Amtliche Radar-Summen nicht erreichbar (${e instanceof Error ? e.message : String(e)})` }; }
  const endMs = Date.parse(m.end);
  const wde = m.windows[String(windowH)]?.de;
  const measured: SumMapInfo['measured'] = {
    endMs, stale: nowMs - endMs > PAST_SUM_STALE_MS,
    de: wde ? { product: wde.product, endMs: Date.parse(wde.end) } : null,
    countries: PAST_SUM_COUNTRIES.map((cc) => {
      const st = m.countries[cc], src = m.sources?.[cc] ?? PAST_SUM_SOURCES[cc];
      const ok = !!st && st.hasEnd && st.maxWindowH >= windowH;
      const note = !st ? 'fehlt im Manifest' : !st.hasEnd ? (st.note ?? `Stunde bis ${fmtHour(endMs)} fehlt`) : st.maxWindowH < windowH ? `nur ${st.maxWindowH} h vollständig` : undefined;
      const label = cc === 'DE' && wde?.product === 'SF' ? PAST_SUM_DE_DAILY.label : src.label;
      return { cc, label, provider: src.provider, ok, ...(note ? { note } : {}) };
    }),
  };
  const w = m.windows[String(windowH)];
  if (!w) return { grid: null, measured, note: `Fenster ${windowH} h fehlt im Produkt` };
  try {
    return { grid: await pastGrid(`${PAST_SUM_DIR}/${m.dir}/${w.file}`, geom), measured, note: null };
  } catch (e) {
    return { grid: null, measured, note: `Summenbild nicht lesbar (${e instanceof Error ? e.message : String(e)})` };
  }
}

/** Dekodierte Bilder (die zwei jüngsten) — Karte und Karte am Ort lesen dasselbe Bild. */
const gridMemo = new Map<string, Promise<SumGridResult>>();
function pastGrid(path: string, geom: ReturnType<typeof sumGeometry>): Promise<SumGridResult> {
  let p = gridMemo.get(path);
  if (!p) {
    p = memoized(`precipsum:${path}`, 'field', () => fetchDataRepo(path, 'bytes') as Promise<Uint8Array>)
      .then(decodeRgbaPngBrowser)
      .then((img) => pastSumGridFromRgba(geom, img.data, img.width, img.height));
    gridMemo.set(path, p);
    p.catch(() => gridMemo.delete(path));
    while (gridMemo.size > 2) gridMemo.delete(gridMemo.keys().next().value as string);
  }
  return p;
}

/**
 * Karte am Ort, Rückfall „Gefallen", wenn keine Station die Summe trägt (keine ≤ 10 km, Fenster > 24 h, unvollständig):
 * die amtliche Flächensumme an der Zelle des Orts — mit Quelle und Stand, nie still als Stationswert.
 */
export interface PastAreaAtPoint { mm: number | null; endMs: number; cc: 'DE' | 'AT' | 'CH'; provider: string; label: string; reason: string | null }
export async function pastSumAtPoint(lat: number, lon: number, windowH: number): Promise<PastAreaAtPoint | null> {
  const geom = sumGeometry();
  const m = await loadPastManifest();
  const w = m.windows[String(windowH)];
  if (!w) return null;
  const g = await pastGrid(`${PAST_SUM_DIR}/${m.dir}/${w.file}`, geom);
  const c = Math.floor(((lon - geom.lon[0]) / (geom.lon[1] - geom.lon[0])) + 0.5);
  const r = Math.floor(((geom.lat[0] - lat) / (geom.lat[0] - geom.lat[geom.width])) + 0.5);
  if (c < 0 || r < 0 || c >= geom.width || r >= geom.height) return null;
  const i = r * geom.width + c;
  if (g.flags[i] & FLAG_OUTSIDE) return null;
  const cc = PAST_SUM_COUNTRIES[geom.country[i]] ?? 'DE';
  const src = m.sources?.[cc] ?? PAST_SUM_SOURCES[cc];
  const de = cc === 'DE' ? w.de : undefined;
  const v = g.mm[i];
  const st = m.countries[cc];
  return {
    mm: Number.isNaN(v) ? null : v, endMs: de ? Date.parse(de.end) : Date.parse(m.end), cc, provider: src.provider,
    label: de?.product === 'SF' ? PAST_SUM_DE_DAILY.label : src.label,
    reason: Number.isNaN(v) ? (st && !st.hasEnd ? st.note ?? 'Stunde fehlt' : 'nicht alle Stunden gemessen') : null,
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
  if (!v || (v.flags & FLAG_OUTSIDE)) return null;
  if (v.mm == null) return 'keine Daten';
  if (v.flags & FLAG_MEASURED) return `${v.mm < 0.05 ? '< 0,1 mm' : `${v.mm < 10 ? v.mm.toFixed(1).replace('.', ',') : Math.round(v.mm)} mm`} gemessen · Radar angeeicht`;
  const src = (v.flags & FLAG_RADAR) && (v.flags & FLAG_FIELD) ? 'Radar + buscosun Fusion' : (v.flags & FLAG_RADAR) ? 'Radar-Nowcast' : 'buscosun Fusion';
  const amount = v.mm < 0.1 ? '< 0,1 mm' : `${v.flags & FLAG_SATURATED ? 'mindestens ' : 'etwa '}${v.mm < 10 ? v.mm.toFixed(1).replace('.', ',') : Math.round(v.mm)} mm`;
  return `${amount} · ${src}`;
}
