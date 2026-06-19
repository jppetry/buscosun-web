/**
 * Gemeinsame Chart-Helfer (Achsen, Ticks) für die History-Diagramme.
 */

export const CHART = { W: 920, H: 300, PADL: 46, PADR: 16, PADT: 16, PADB: 30 };
export const plotW = () => CHART.W - CHART.PADL - CHART.PADR;
export const plotH = () => CHART.H - CHART.PADT - CHART.PADB;

/** „Schöne" Achsenschritte für ein Werteintervall. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

export function fmtNum(x: number, digits = 1): string {
  return x.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
