/**
 * Phase RC: der Rechenteil der Chance-Karte — eigener Lazy-Chunk (`useChanceMap` lädt ihn erst in der Ansicht „Chance").
 *
 * Für die gezeigte Stunde: Feld-Index + Manifeste (t1, t2), das eine Bild des Schritts (32–75 KB), Wahrscheinlichkeit je
 * Zelle, daraus die Bänder (≥ 10 / 30 / 50 / 70 / 90 %, Punktdichte), die Lücken (schraffiert) und die Konturen
 * 30 / 50 / 70 / 90 % (Linien mit Beschriftung) als GeoJSON — Marching Squares auf dem Feldgitter (`contours.ts`).
 * Netz über die Wege der Summen (`fetchDataRepo`: raw zuerst, jsDelivr nach 2,5 s; Gedächtnis).
 */
import { decodeRgbaPngBrowser } from '../point/client/browserPng';
import { fieldRunDir, CHANCE_DEFINITION, type FieldGrid } from '../point/fieldFormat';
import { fetchDataRepo, memoized } from '../precipSums/obsSumStore';
import { chanceHourAt, fmtChancePct, type ChanceThreshold } from './chanceModel';
import { chanceAt, chanceGridFromRgba, loadChanceTiers, pickChanceStep } from './chanceField';
import { chanceGeometry, gridRect, multi } from './chanceGeometry';
import type { ChanceMapInfo } from './chanceMapTypes';

export { ChanceMapLayer } from './chanceMapLayer';
export { chanceGeometry } from './chanceGeometry';

const H = 3_600_000;

export interface ChanceMapResult {
  info: ChanceMapInfo;
  bands: GeoJSON.FeatureCollection;
  missing: GeoJSON.FeatureCollection;
  lines: GeoJSON.FeatureCollection;
  /** Für den Hover. */
  grid: FieldGrid | null;
  values: Float32Array | null;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const imgMemo = new Map<string, Promise<{ data: Uint8Array | Uint8ClampedArray; width: number; height: number }>>();
function loadImage(path: string) {
  let p = imgMemo.get(path);
  if (!p) {
    p = memoized(`chance:${path}`, 'field', () => fetchDataRepo(path, 'bytes') as Promise<Uint8Array>).then(decodeRgbaPngBrowser);
    imgMemo.set(path, p);
    p.catch(() => imgMemo.delete(path));
    while (imgMemo.size > 6) imgMemo.delete(imgMemo.keys().next().value as string);
  }
  return p;
}

/** Eine Rechnung der Chance-Karte für die Zeit `tMs` (Slider oder Leiste) und die Schwelle. */
export async function computeChanceMap(tMs: number, threshold: ChanceThreshold, nowMs: number): Promise<ChanceMapResult> {
  const hour = chanceHourAt(tMs, nowMs);
  const base: ChanceMapInfo = {
    status: 'ready', threshold, hourFromMs: hour.fromMs, hourToMs: hour.toMs, stepFromMs: null, stepToMs: null, past: hour.past,
    field: null, notes: [], stats: null, definition: { measured: CHANCE_DEFINITION.measured, caveat: CHANCE_DEFINITION.caveat },
  };
  const set = await memoized('chance:tiers', 'fieldIndex', () => loadChanceTiers((p) => fetchDataRepo(p, 'json')));
  const pick = pickChanceStep(set.tiers, hour.fromMs, hour.toMs, threshold);
  const notes = [...set.notes];
  if (!pick) {
    notes.push('kein Kartenfeld für diese Stunde');
    return { info: { ...base, notes }, bands: EMPTY, missing: EMPTY, lines: EMPTY, grid: null, values: null };
  }
  const { tier } = pick;
  const field = { tier: tier.tier, run: tier.run, runAtMs: tier.runAtMs, fusionName: tier.fusionName };
  const info: ChanceMapInfo = { ...base, stepFromMs: pick.stepFromMs, stepToMs: pick.stepToMs, field, notes };
  if (!pick.file) {
    notes.push(threshold === 'any'
      ? 'Feld ohne Niederschlag für diesen Schritt'
      : `Feld ${tier.tier} ${tier.run} ohne P(${threshold === 'ge1' ? '≥ 1 mm' : '≥ 5 mm'}) — kommt mit dem ersten Feldlauf nach dem Push des Producers (Phase RC)`);
    const n = tier.grid.width * tier.grid.height;
    return { info: { ...info, stats: { cells: n, missing: n, maxP: null } }, bands: EMPTY, missing: { type: 'FeatureCollection', features: [multi(gridRect(tier.grid), {}) as GeoJSON.Feature] }, lines: EMPTY, grid: tier.grid, values: new Float32Array(n).fill(NaN) };
  }
  const img = await loadImage(`${fieldRunDir(tier.run, tier.tier)}/${pick.file}`);
  if (img.width !== tier.grid.width || img.height !== tier.grid.height) throw new Error(`Kartenfeld ${img.width}×${img.height} statt ${tier.grid.width}×${tier.grid.height}`);
  const values = chanceGridFromRgba(img.data, img.width, img.height, threshold);
  const geo = chanceGeometry(values, tier.grid);
  return { info: { ...info, stats: { cells: values.length, missing: geo.missingCells, maxP: geo.maxP } }, bands: geo.bands, missing: geo.missing, lines: geo.lines, grid: tier.grid, values };
}

/** Hover-Text der Zelle unter dem Zeiger. */
export function chanceHoverText(r: Pick<ChanceMapResult, 'grid' | 'values' | 'info'>, lat: number, lon: number): string | null {
  if (!r.grid || !r.values) return null;
  const v = chanceAt(r.grid, r.values, lat, lon);
  if (v === undefined) return null;
  if (v === null) return 'keine Daten';
  const span = r.info.stepToMs != null && r.info.stepFromMs != null ? Math.round((r.info.stepToMs - r.info.stepFromMs) / H) : 1;
  return `${fmtChancePct(v)} · Modell · Cube${span > 1 ? ` · ${span}-h-Intervall` : ''}`;
}
