/**
 * Räumliche Niederschlagsunsicherheit — Kern (US-4.3, pur).
 *
 * Aus den Member-Regensummen je Zelle wird der Anteil der Szenarien mit Regen
 * („Nass-Anteil") berechnet sowie ein Richtungs-Klartext („westlich mehr"), der
 * West/Ost- und Nord/Süd-Tendenz im Raster vergleicht. Reine Statistik.
 */

import { GRID_N, type GridCell } from './precipGrid';
import { PRECIP_DAY_WET_MM } from './confidenceModel';

/** „Regen fällt" = dieselbe kanonische Tagesschwelle wie überall sonst. */
export const GRID_WET_MM = PRECIP_DAY_WET_MM;

/** Anteil der Member mit Regen ≥ Schwelle in einer Zelle an einem Tag (0…1). */
export function cellWetFraction(cell: GridCell, dayIndex: number, thresholdMm = GRID_WET_MM): number {
  const sums = cell.sumsByDay[dayIndex] ?? [];
  if (!sums.length) return NaN;
  return sums.filter((s) => s >= thresholdMm).length / sums.length;
}

export interface GridSummary {
  /** Nass-Anteil je Zelle, row-major; NaN wenn keine Daten. */
  fractions: number[];
  centerFraction: number;
  /** Klartext zur räumlichen Tendenz. */
  text: string;
}

const round = (x: number) => Math.round(x);

/** Auswertung des Rasters für einen Tag (US-4.3). */
export function gridSummary(cells: GridCell[], dayIndex: number, thresholdMm = GRID_WET_MM): GridSummary {
  const fractions = cells.map((c) => cellWetFraction(c, dayIndex, thresholdMm));
  const center = cells.find((c) => c.isCenter);
  const centerFraction = center ? cellWetFraction(center, dayIndex, thresholdMm) : NaN;

  // West/Ost- und Nord/Süd-Mittel (NaN ignorieren).
  const half = (GRID_N - 1) / 2;
  const meanOf = (pred: (c: GridCell) => boolean) => {
    const vs = cells.filter(pred).map((c) => cellWetFraction(c, dayIndex, thresholdMm)).filter(Number.isFinite);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN;
  };
  const west = meanOf((c) => c.col < half), east = meanOf((c) => c.col > half);
  const north = meanOf((c) => c.row < half), south = meanOf((c) => c.row > half);

  const overall = fractions.filter(Number.isFinite);
  const avg = overall.length ? overall.reduce((a, b) => a + b, 0) / overall.length : NaN;

  let text: string;
  if (!Number.isFinite(avg)) text = 'Keine Rasterdaten verfügbar.';
  else if (avg < 0.08) text = 'In nahezu allen Szenarien bleibt es in der Umgebung trocken.';
  else if (avg > 0.92) text = 'In nahezu allen Szenarien fällt in der Umgebung Regen.';
  else {
    const dirs: string[] = [];
    const SIG = 0.18; // signifikanter Gradient
    if (Number.isFinite(west) && Number.isFinite(east) && Math.abs(west - east) >= SIG) dirs.push(west > east ? 'westlich mehr' : 'östlich mehr');
    if (Number.isFinite(north) && Number.isFinite(south) && Math.abs(north - south) >= SIG) dirs.push(north > south ? 'nördlich mehr' : 'südlich mehr');
    const base = `An deinem Ort fällt in ${round(centerFraction * 100)} % der Szenarien Regen`;
    text = dirs.length ? `${base} — ${dirs.join(', ')}.` : `${base}; die Umgebung ist ähnlich.`;
  }

  return { fractions, centerFraction, text };
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface GridCheck { case: string; ok: boolean; detail: string }

export function verifyPrecipGridModel(): { checks: GridCheck[]; passed: number; failed: number } {
  const checks: GridCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Zelle mit 2 von 4 Membern nass.
  const cell = (sums: number[]): GridCell => ({ lat: 0, lon: 0, row: 0, col: 0, isCenter: false, sumsByDay: [sums] });
  add('Nass-Anteil 2/4', cellWetFraction(cell([0, 0.5, 2, 3]), 0) === 0.5, `${cellWetFraction(cell([0, 0.5, 2, 3]), 0)}`);
  add('Nass-Anteil 0 ohne Regen', cellWetFraction(cell([0, 0, 0.2]), 0) === 0);
  add('Nass-Anteil NaN ohne Daten', Number.isNaN(cellWetFraction(cell([]), 0)));

  // 5×5-Raster: West nass (3 mm), Ost trocken (0). → „westlich mehr".
  const grid: GridCell[] = [];
  const half = 2;
  for (let r = 0; r < GRID_N; r++) for (let c = 0; c < GRID_N; c++) {
    const wet = c < half ? [3, 3, 3, 3] : c > half ? [0, 0, 0, 0] : [3, 0, 0, 0];
    grid.push({ lat: 0, lon: 0, row: r, col: c, isCenter: r === half && c === half, sumsByDay: [wet] });
  }
  const sum = gridSummary(grid, 0);
  add('Raster: 25 Zellen', sum.fractions.length === 25, `${sum.fractions.length}`);
  add('Richtung westlich mehr', sum.text.includes('westlich mehr'), sum.text);

  // Überall trocken → Trocken-Aussage.
  const dry = grid.map((c) => ({ ...c, sumsByDay: [[0, 0, 0, 0]] }));
  add('überall trocken', gridSummary(dry, 0).text.includes('trocken'), gridSummary(dry, 0).text);
  // Überall nass → Nass-Aussage.
  const wet = grid.map((c) => ({ ...c, sumsByDay: [[3, 3, 3, 3]] }));
  add('überall Regen', gridSummary(wet, 0).text.includes('Regen'), gridSummary(wet, 0).text);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyPrecipGridModel: typeof verifyPrecipGridModel }).__verifyPrecipGridModel = verifyPrecipGridModel;
}
