/**
 * Phase SK: the computing part of the snow cap — own lazy chunk (`useSnowCap` loads it only with `?sk=1` and the layer
 * "Schneefallgrenze" on). Per map time: field step (t1, then t2) + wet grid (radar of the country, else field chance);
 * per viewport: Terrarium tiles + `buildCap`. Network via the data-repo paths of the sums (raw first, jsDelivr hedge).
 */
import { loadElevationTiles, type ElevationTiles } from '../fusion/elevation';
import { fieldRunDir } from '../point/fieldFormat';
import { decodeRgbaPngBrowser } from '../point/client/browserPng';
import { fetchDataRepo, memoized } from '../precipSums/obsSumStore';
import { loadChanceTiers, pickChanceStep, chanceGridFromRgba } from '../precipChance/chanceField';
import { getRadarStack, type RadarStack } from '../radar/radarFrames';
import type { Country } from '../types';
import { loadSnowTiers, pickSnowLead, snowGridFromRgba, snowAt, type SnowGrid } from './snowField';
import { buildWetGrid, wetSampler, type WetGrid } from './capWet';
import { buildCap, demAt, type CapResult, type CapView } from './capRaster';
import { PHASE_WORD_SK, fmtSnowLine, fmtMeters, type CapPalette, type SkPhase } from './snowCapModel';
import { phaseAt } from './snowPhase';

export { SnowCapLayer, openSnowTap } from './snowCapLayer';
export { capViewFor, demZoomFor } from './snowCapView';

const H = 3_600_000;
/** Radar exists only from the look-back to the end of the nowcast — outside, no stack is fetched. */
const RADAR_FROM_MS = -2.2 * H, RADAR_TO_MS = 3.2 * H;

export interface SnowCapInfo {
  status: 'idle' | 'loading' | 'ready' | 'error';
  validMs: number | null;
  field: { tier: string; run: string; runAtMs: number; fusionName: string | null } | null;
  wet: 'radar' | 'field' | 'mixed' | 'none';
  notes: string[];
  gapShare: number | null;
  error?: string;
}
export const SNOW_CAP_IDLE: SnowCapInfo = { status: 'idle', validMs: null, field: null, wet: 'none', notes: [], gapShare: null };

const imgMemo = new Map<string, Promise<{ data: Uint8Array | Uint8ClampedArray; width: number; height: number }>>();
function loadImage(path: string) {
  let p = imgMemo.get(path);
  if (!p) {
    p = memoized(`snowcap:${path}`, 'field', () => fetchDataRepo(path, 'bytes') as Promise<Uint8Array>).then(decodeRgbaPngBrowser);
    imgMemo.set(path, p);
    p.catch(() => imgMemo.delete(path));
    while (imgMemo.size > 8) imgMemo.delete(imgMemo.keys().next().value as string);
  }
  return p;
}

const radarStack = (c: Country) => memoized(`snowcap:radar:${c}`, 'latest', () => getRadarStack(c)).catch(() => null as RadarStack | null);

export interface SnowCapPrep { info: SnowCapInfo; snow: SnowGrid | null; wet: WetGrid | null }

export async function prepareSnowCapTime(tMs: number, nowMs: number = Date.now()): Promise<SnowCapPrep> {
  const notes: string[] = [];
  const set = await memoized('snowcap:tiers', 'fieldIndex', () => loadSnowTiers((p) => fetchDataRepo(p, 'json')));
  notes.push(...set.notes);
  const pick = pickSnowLead(set.tiers, tMs);
  if (!pick) {
    notes.push('Schneefallgrenze für diese Zeit ohne Daten (das Kartenfeld reicht bis 120 h ab Lauf; danach führt keine Quelle sie)');
    return { info: { ...SNOW_CAP_IDLE, status: 'ready', notes, gapShare: 1 }, snow: null, wet: null };
  }
  const { tier, lead } = pick;
  const img = await loadImage(`${fieldRunDir(tier.run, tier.tier)}/${lead.file}`);
  if (img.width !== tier.grid.width || img.height !== tier.grid.height) throw new Error(`Kartenfeld ${img.width}×${img.height} statt ${tier.grid.width}×${tier.grid.height}`);
  const snow = snowGridFromRgba(img.data, tier.grid);
  const inRadar = tMs - nowMs >= RADAR_FROM_MS && tMs - nowMs <= RADAR_TO_MS;
  const [de, at, ch] = inRadar ? await Promise.all((['DE', 'AT', 'CH'] as const).map(radarStack)) : [null, null, null];
  let chance: Float32Array | null = null;
  try {
    const cs = await memoized('snowcap:chance-tiers', 'fieldIndex', () => loadChanceTiers((p) => fetchDataRepo(p, 'json')));
    const hour = Math.floor(tMs / H) * H;
    const cp = pickChanceStep(cs.tiers.filter((t) => t.tier === tier.tier), hour, hour + H, 'any');
    if (cp?.file) {
      const ci = await loadImage(`${fieldRunDir(cp.tier.run, cp.tier.tier)}/${cp.file}`);
      if (ci.width === tier.grid.width && ci.height === tier.grid.height) chance = chanceGridFromRgba(ci.data, ci.width, ci.height, 'any');
    }
  } catch (e) { notes.push(`Regenchance des Felds nicht lesbar (${e instanceof Error ? e.message : String(e)})`); }
  const wet = buildWetGrid(tier.grid, { DE: de, AT: at, CH: ch }, tMs, chance);
  const kind: SnowCapInfo['wet'] = wet.radar && wet.field ? 'mixed' : wet.radar ? 'radar' : wet.field ? 'field' : 'none';
  let miss = 0;
  for (let i = 0; i < snow.mid.length; i++) if (Number.isNaN(snow.mid[i])) miss++;
  return {
    info: { status: 'ready', validMs: lead.validAtMs, field: { tier: tier.tier, run: tier.run, runAtMs: tier.runAtMs, fusionName: tier.fusionName }, wet: kind, notes, gapShare: miss / snow.mid.length },
    snow, wet,
  };
}

const lng2x = (lng: number, z: number) => ((lng + 180) / 360) * (1 << z);
const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z); };
const demMemo = new Map<string, Promise<ElevationTiles>>();
function demFor(v: CapView, z: number): Promise<ElevationTiles> {
  const key = `${z}:${Math.floor(lng2x(v.west, z))}:${Math.floor(lat2y(v.north, z))}:${Math.floor(lng2x(v.east, z))}:${Math.floor(lat2y(v.south, z))}`;
  let p = demMemo.get(key);
  if (!p) {
    // No abort signal: a tile set started for one view is reused by the next (memo), aborting would poison it.
    p = loadElevationTiles({ lngMin: v.west, lngMax: v.east, latMin: v.south, latMax: v.north }, z);
    demMemo.set(key, p);
    p.catch(() => demMemo.delete(key));
    while (demMemo.size > 4) demMemo.delete(demMemo.keys().next().value as string);
  }
  return p;
}

export async function renderSnowCap(prep: SnowCapPrep, view: CapView, demZoom: number, palette: CapPalette, signal: AbortSignal): Promise<{ result: CapResult | null; dem: ElevationTiles | null }> {
  if (!prep.snow) return { result: null, dem: null };
  const dem = await demFor(view, demZoom);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const wet = prep.wet ? wetSampler(prep.wet) : () => null;
  const result = await buildCap({ view, dem, snow: prep.snow, wet, palette, signal });
  return { result, dem };
}

export interface SnowCapPoint { h: number | null; mid: number; half: number; phase: SkPhase | null }

export function snowCapAt(prep: SnowCapPrep | null, dem: ElevationTiles | null, lat: number, lon: number): SnowCapPoint | null {
  if (!prep?.snow) return null;
  const s = snowAt(prep.snow, lat, lon);
  if (!s) return null;
  const h = dem ? demAt(dem, lon, lat) : NaN;
  return { h: Number.isFinite(h) ? h : null, mid: s.mid, half: s.half, phase: Number.isFinite(h) ? phaseAt(h, s.mid, s.half) : null };
}

/** "Höhe 820 m · Schneefallgrenze 1 400 m (1 200–1 650 m) · Regen". */
export function snowCapHoverText(at: SnowCapPoint | null): string | null {
  if (!at) return null;
  const head = at.h != null ? `Höhe ${fmtMeters(at.h)} m · ` : '';
  return `${head}${fmtSnowLine(at.mid, at.half)}${at.phase ? ` · ${PHASE_WORD_SK[at.phase]}` : ''}`;
}
