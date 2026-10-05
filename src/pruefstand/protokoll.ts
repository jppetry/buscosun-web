/**
 * protokoll.ts — the frozen test protocol of the Prüfstand as a typed, validated object (pure: no I/O, no hashing —
 * `scripts/pruefstand/lib/protokoll.mjs` reads the files and checks the seal). `audit/pruefstand-plan.md` §3.
 */

export interface ProtocolWindow { id: string; fromH: number; toH: number }
export interface ProtocolVariable { name: string; unit: string; truth: string; cell: 'kern' | 'neben'; kernToH?: number; thresholdMmH?: number; minWindMs?: number }
export interface Protocol {
  id: string;
  quantiles: number[];
  quantiles3: number[];
  leads: { hourlyToH: number; threeHourlyToH: number; sixHourlyToH: number; diagnosticHourlyToH: number };
  windows: ProtocolWindow[];
  seams: number[];
  variables: Record<string, ProtocolVariable>;
  countries: string[];
  truth: { stand: string; from: string; maturityDays: number };
  statistics: { alpha: number; minDays: number; power: number; bootstrap: { draws: number; seed: number } };
  extremes: { quantile: number };
  selfcheck: { aa: { partner: string; repetitions: number; maxRate: number; seed: number }; controls: { halvedBands: number; noise: number; widenedCandidate: number } };
  gates: { G2: { delta: number }; G3: { nominal: number; z: number }; G4: { maxPointMs: number; tolK: number; tolMs: number; physicsMaxShare: number }; overfit: { margin: number } };
  [key: string]: unknown;
}

/** The channels of a forecast block, in file order: `quantiles.length` values per quantity, then one value per extra. */
export const QUANTITY_VARS = ['t', 'td', 'ws', 'gust', 'precip', 'clct'] as const;
export type QuantityVar = (typeof QUANTITY_VARS)[number];
export const EXTRA_CHANNELS = ['pWet', 'dd'] as const;
/** The channels of a truth block. */
export const TRUTH_VARS = ['t', 'td', 'ws', 'gust', 'precip', 'clct', 'dd'] as const;

/** Structural validation; returns the list of defects (empty = valid). */
export function validateProtocol(p: unknown): string[] {
  const e: string[] = [];
  const o = p as Protocol;
  if (!o || typeof o !== 'object') return ['kein Objekt'];
  if (typeof o.id !== 'string' || !/^P\d+$/.test(o.id)) e.push('id fehlt oder hat nicht die Form P<n>');
  const q = o.quantiles;
  if (!Array.isArray(q) || q.length < 3) e.push('quantiles fehlt');
  else {
    for (let i = 0; i < q.length; i++) {
      if (!(q[i] > 0 && q[i] < 1)) e.push(`Quantilstufe ${q[i]} außerhalb (0, 1)`);
      if (i && !(q[i] > q[i - 1])) e.push('Quantilstufen nicht aufsteigend');
      // symmetric levels make CRPS_Q of a point value equal to the absolute error (Konzept §7)
      if (Math.abs(q[i] + q[q.length - 1 - i] - 1) > 1e-12) e.push('Quantilstufen nicht symmetrisch um 0,5');
    }
    for (const t of o.quantiles3 ?? []) if (!q.some((x) => Math.abs(x - t) < 1e-12)) e.push(`quantiles3: ${t} ist keine Stufe des Quantilsatzes`);
  }
  if (!Array.isArray(o.windows) || !o.windows.length) e.push('windows fehlt');
  else for (let i = 0; i < o.windows.length; i++) {
    const w = o.windows[i];
    if (!(w.toH >= w.fromH)) e.push(`Fenster ${w.id}: toH < fromH`);
    if (i && w.fromH !== o.windows[i - 1].toH + 1) e.push(`Fenster ${w.id} schließt nicht lückenlos an`);
  }
  const L = o.leads;
  if (!L || !(L.hourlyToH < L.threeHourlyToH && L.threeHourlyToH < L.sixHourlyToH)) e.push('leads unvollständig oder nicht aufsteigend');
  for (const v of [...QUANTITY_VARS, 'wet', 'dd']) if (!o.variables?.[v]) e.push(`variables.${v} fehlt`);
  if (!(o.truth?.maturityDays >= 0)) e.push('truth.maturityDays fehlt');
  if (!(o.statistics?.alpha > 0 && o.statistics.alpha < 0.5)) e.push('statistics.alpha fehlt');
  if (!(o.gates?.G2?.delta >= 0)) e.push('gates.G2.delta fehlt');
  if (!(o.gates?.G3?.nominal > 0 && o.gates.G3.nominal < 1)) e.push('gates.G3.nominal fehlt');
  return e;
}

/** The lead hours of an issue at UTC hour `issueHourUtc`: the P1 raster and the diagnostic hours (sorted, disjoint). */
export function leadsOf(p: Protocol, issueHourUtc: number): { raster: number[]; diagnostic: number[]; all: number[] } {
  const raster: number[] = [], diagnostic: number[] = [];
  const L = p.leads;
  for (let h = 1; h <= L.sixHourlyToH; h++) {
    const validHour = (issueHourUtc + h) % 24;
    const on = h <= L.hourlyToH || (h <= L.threeHourlyToH ? validHour % 3 === 0 : validHour % 6 === 0);
    if (on) raster.push(h); else if (h <= L.diagnosticHourlyToH) diagnostic.push(h);
  }
  return { raster, diagnostic, all: [...raster, ...diagnostic].sort((a, b) => a - b) };
}

/** The interval (hours) a lead's gust maximum and precipitation mean refer to. */
export function stepHoursOf(p: Protocol, leadH: number): number {
  return leadH <= p.leads.hourlyToH ? 1 : leadH <= p.leads.threeHourlyToH ? 3 : 6;
}

/** Index of the lead window a raster lead falls into, −1 outside. */
export function windowOf(p: Protocol, leadH: number): number {
  for (let i = 0; i < p.windows.length; i++) if (leadH >= p.windows[i].fromH && leadH <= p.windows[i].toH) return i;
  return -1;
}
