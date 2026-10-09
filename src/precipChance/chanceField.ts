/**
 * Phase RC: die Chance aus den Kartenfeldern von buscosun Fusion (Modell · Cube — ohne Station, Radar und Gelände am Ort).
 *
 *   „> 0"        R-Kanal von `precip-<LLL>.png` (Chance = 1 − pDry, E-RC-3)
 *   „≥ 1/≥ 5 mm" R/G-Kanal von `pexc-<LLL>.png` (Phase RC, E-RC-2) — fehlt die Datei (Felder vor dem Producer-Push), ist die
 *                Karte für diese Schwelle eine benannte Lücke; keine Rückrechnung aus Median/q90.
 *
 * Für eine Stunde gilt der native Schritt, dessen Intervall (t − Δ, t] die Stunde ganz enthält: t1 zuerst (stündlich), dann
 * t2 (3 h; die Legende nennt dann das ganze Intervall). Rein bis auf die injizierten Lader.
 */

import { TIER_BY_ID, type TierId } from '../point/cubeFormat';
import {
  FIELD_INDEX_PATH, FIELD_MANIFEST_FILE, fieldRunDir, parseFieldIndex, parseFieldManifest, decodePexcPixel,
  type FieldGrid,
} from '../point/fieldFormat';
import type { ChanceThreshold } from './chanceModel';

const H = 3_600_000;

export interface ChanceFieldTier {
  tier: TierId;
  run: string;
  runAtMs: number;
  stepH: number;
  grid: FieldGrid;
  leads: Array<{ leadH: number; validAtMs: number; precip: string | null; pexc: string | null }>;
  /** Stand von buscosun Fusion, mit dem das Feld GEBAUT wurde (Manifest `chain.options.fusionName`). */
  fusionName: string | null;
}

export type JsonFetcher = (path: string) => Promise<unknown>;

/** Index + Manifeste t1, t2 (der Slider und die 48-h-Leiste reichen nie bis t3). */
export async function loadChanceTiers(getJson: JsonFetcher, tiers: TierId[] = ['t1', 't2']): Promise<{ tiers: ChanceFieldTier[]; notes: string[] }> {
  const idx = parseFieldIndex(await getJson(FIELD_INDEX_PATH));
  if (!idx) return { tiers: [], notes: ['Index der Kartenfelder unbekannt'] };
  const out: ChanceFieldTier[] = [];
  const notes: string[] = [];
  for (const tierId of tiers) {
    const e = idx.latestByTier[tierId];
    if (!e) { notes.push(`${tierId}: kein Feld im Index`); continue; }
    try {
      const man = parseFieldManifest(await getJson(`${fieldRunDir(e.run, tierId)}/${FIELD_MANIFEST_FILE}`));
      if (!man) { notes.push(`${tierId}: Manifest ungültig`); continue; }
      out.push({
        tier: tierId, run: man.run, runAtMs: man.runAtMs, stepH: TIER_BY_ID[tierId].stepH, grid: man.grid,
        leads: man.leads.map((l) => ({ leadH: l.leadH, validAtMs: l.validAtMs, precip: l.precip, pexc: l.pexc ?? null })),
        fusionName: typeof man.chain?.options?.fusionName === 'string' ? man.chain.options.fusionName as string : null,
      });
    } catch (err) { notes.push(`${tierId}: Manifest nicht lesbar (${err instanceof Error ? err.message : String(err)})`); }
  }
  return { tiers: out, notes };
}

export interface ChanceStepPick {
  tier: ChanceFieldTier;
  lead: ChanceFieldTier['leads'][number];
  stepFromMs: number;
  stepToMs: number;
  /** Datei der gewählten Schwelle; `null` = das Feld trägt sie nicht (Lücke mit Grund). */
  file: string | null;
}

/** Der Schritt, dessen Intervall die Stunde [fromMs, toMs) ganz enthält — feinste Stufe zuerst; `null` = keiner. */
export function pickChanceStep(tiers: readonly ChanceFieldTier[], fromMs: number, toMs: number, threshold: ChanceThreshold): ChanceStepPick | null {
  for (const t of tiers) {
    for (const l of t.leads) {
      const a = l.validAtMs - t.stepH * H, b = l.validAtMs;
      if (fromMs >= a - 1000 && toMs <= b + 1000) {
        return { tier: t, lead: l, stepFromMs: a, stepToMs: b, file: threshold === 'any' ? l.precip : l.pexc };
      }
    }
  }
  return null;
}

/** Wahrscheinlichkeit je Zelle (Zeile 0 = Norden), NaN = fehlt (A ≠ 255) — nie 0. */
export function chanceGridFromRgba(rgba: ArrayLike<number>, width: number, height: number, threshold: ChanceThreshold): Float32Array {
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (rgba[o + 3] !== 255) { out[i] = NaN; continue; }
    if (threshold === 'any') { out[i] = rgba[o] / 254; continue; }
    const v = decodePexcPixel(rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]);
    out[i] = v ? (threshold === 'ge1' ? v.ge1 : v.ge5) : NaN;
  }
  return out;
}

/** Wert an (lat, lon) — Zelle des Feldgitters; `undefined` außerhalb, `null` = fehlt. */
export function chanceAt(grid: FieldGrid, values: Float32Array, lat: number, lon: number): number | null | undefined {
  const ix = Math.round((lon - grid.lon0) / grid.deg), iy = Math.round((lat - grid.lat0) / grid.deg);
  if (ix < 0 || iy < 0 || ix >= grid.width || iy >= grid.height) return undefined;
  const v = values[(grid.height - 1 - iy) * grid.width + ix];
  return Number.isNaN(v) ? null : v;
}
