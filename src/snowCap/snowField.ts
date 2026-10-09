/**
 * Phase SK: the snowfall line of the Fusion map field (`snowlmt-<LLL>.png`, label "Modell · Cube"; NP-0b contract in
 * `point/fieldFormat.ts`). t1 0–48 h hourly, t2 51–120 h every 3 h; t3 carries none. Pure except the injected loader.
 */
import { TIER_BY_ID, type TierId } from '../point/cubeFormat';
import {
  FIELD_INDEX_PATH, FIELD_MANIFEST_FILE, fieldRunDir, parseFieldIndex, parseFieldManifest, decodeSnowPixel, type FieldGrid,
} from '../point/fieldFormat';

const MIN = 60_000;

export interface SnowFieldTier {
  tier: TierId;
  run: string;
  runAtMs: number;
  stepH: number;
  grid: FieldGrid;
  leads: Array<{ leadH: number; validAtMs: number; file: string | null }>;
  /** Stand of buscosun Fusion the field was BUILT with (manifest `chain.options.fusionName`). */
  fusionName: string | null;
}

export type JsonFetcher = (path: string) => Promise<unknown>;

export async function loadSnowTiers(getJson: JsonFetcher): Promise<{ tiers: SnowFieldTier[]; notes: string[] }> {
  const idx = parseFieldIndex(await getJson(FIELD_INDEX_PATH));
  if (!idx) return { tiers: [], notes: ['Index der Kartenfelder unbekannt'] };
  const tiers: SnowFieldTier[] = [];
  const notes: string[] = [];
  for (const tierId of ['t1', 't2'] as TierId[]) {
    const e = idx.latestByTier[tierId];
    if (!e) { notes.push(`${tierId}: kein Feld im Index`); continue; }
    try {
      const man = parseFieldManifest(await getJson(`${fieldRunDir(e.run, tierId)}/${FIELD_MANIFEST_FILE}`));
      if (!man) { notes.push(`${tierId}: Manifest ungültig`); continue; }
      tiers.push({
        tier: tierId, run: man.run, runAtMs: man.runAtMs, stepH: TIER_BY_ID[tierId].stepH, grid: man.grid,
        leads: man.leads.map((l) => ({ leadH: l.leadH, validAtMs: l.validAtMs, file: l.snowlmt })),
        fusionName: typeof man.chain?.options?.fusionName === 'string' ? (man.chain.options.fusionName as string) : null,
      });
    } catch (err) { notes.push(`${tierId}: Manifest nicht lesbar (${err instanceof Error ? err.message : String(err)})`); }
  }
  return { tiers, notes };
}

/** Tolerance per tier: the snowline is an instant value, the nearest native step within half a step counts. */
const TOL_MS: Record<string, number> = { t1: 30 * MIN, t2: 90 * MIN };

export function pickSnowLead(tiers: readonly SnowFieldTier[], tMs: number): { tier: SnowFieldTier; lead: SnowFieldTier['leads'][number] } | null {
  for (const id of ['t1', 't2']) {
    const t = tiers.find((x) => x.tier === id);
    if (!t) continue;
    let best: SnowFieldTier['leads'][number] | null = null;
    for (const l of t.leads) {
      if (!l.file) continue;
      const d = Math.abs(l.validAtMs - tMs);
      if (d <= TOL_MS[id] && (!best || d < Math.abs(best.validAtMs - tMs))) best = l;
    }
    if (best) return { tier: t, lead: best };
  }
  return null;
}

export interface SnowGrid { grid: FieldGrid; mid: Float32Array; half: Float32Array }

export function snowGridFromRgba(rgba: ArrayLike<number>, grid: FieldGrid): SnowGrid {
  const n = grid.width * grid.height;
  const mid = new Float32Array(n), half = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = decodeSnowPixel(rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    mid[i] = v ? v.mid : NaN;
    half[i] = v ? v.half : NaN;
  }
  return { grid, mid, half };
}

/** Bilinear between the four surrounding cell centres, renormalised over the valid ones (row 0 = north). */
export function snowAt(g: SnowGrid, lat: number, lon: number): { mid: number; half: number } | null | undefined {
  const { width: W, height: Hh, lon0, lat0, deg } = g.grid;
  const fx = (lon - lon0) / deg, fy = (lat - lat0) / deg; // fy counts from the south
  if (fx < -0.5 || fy < -0.5 || fx > W - 0.5 || fy > Hh - 0.5) return undefined;
  const x0 = Math.max(0, Math.min(W - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(Hh - 1, Math.floor(fy)));
  const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(Hh - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  let ws = 0, m = 0, h = 0;
  const take = (x: number, y: number, w: number) => {
    if (w <= 0) return;
    const i = (Hh - 1 - y) * W + x;
    const a = g.mid[i];
    if (Number.isNaN(a)) return;
    ws += w; m += w * a; h += w * g.half[i];
  };
  take(x0, y0, (1 - tx) * (1 - ty)); take(x1, y0, tx * (1 - ty)); take(x0, y1, (1 - tx) * ty); take(x1, y1, tx * ty);
  if (ws <= 1e-9) return null;
  return { mid: m / ws, half: h / ws };
}
