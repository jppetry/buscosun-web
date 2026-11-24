/**
 * Phase GM (GM-4, E-GM-20; audit/gletscher-schneemodell.md §3h) — contract of the SHADOW PAIRS of the snowpack line: per run one file
 * `snowpack/pairs/<run>.json` that puts the computed snow depth of the snowpack, at the elevation of each glacier's assigned snow station, next to what
 * that station measured at the run hour. A comparison, not a coupling: no value of the snowpack is changed by it (the diagnosis found nothing the data
 * support coupling yet, §3h.4). Written by `scripts/glacier/melt.mjs` behind `--snowpack-pairs=on` (default off), only together with the snowpack.
 * No page reads it.
 *
 * Honesty rules encoded here:
 *  - the model values (`m`, `hn`) are COMPUTED, the station values (`v`, `hsd`) are MEASURED and quoted as the station line has them — the document says
 *    which field is which (`origins`), and that a station stands on rock or ridge next to the ice, not on it;
 *  - a station value outside the time window of the run hour is not used: the pair keeps the model value, `v: null` and the reason (`why`);
 *  - the model is never extrapolated: below the tongue it is the tongue's value, above the top the top's (`at` says which).
 */
export const GLACIER_SNOWPACK_PAIRS_DIR = 'snowpack/pairs';
export const glacierSnowpackPairsPath = (run: string) => `${GLACIER_SNOWPACK_PAIRS_DIR}/${run}.json`;
/** A station value counts for the run hour when its stamp lies at most this many minutes before it and not more than this many after it (`set`). */
export const GLACIER_SNOWPACK_PAIRS_WINDOW_MIN = Object.freeze([60, 15] as const);
/** Where the station stands against the three elevations of the snowpack row. */
export const GLACIER_SNOWPACK_PAIRS_AT = Object.freeze(['below', 'inside', 'above'] as const);
/** Why a pair carries no station value. */
export const GLACIER_SNOWPACK_PAIRS_WHY = Object.freeze(['no-value', 'stale', 'future'] as const);
export const GLACIER_SNOWPACK_PAIRS_NOTE = 'Vergleich, keine Kopplung: Modellwert berechnet, Stationswert gemessen; die Station steht auf Fels oder Grat neben dem Eis, nicht darauf';

export type PairsAt = (typeof GLACIER_SNOWPACK_PAIRS_AT)[number];
export type PairsWhy = (typeof GLACIER_SNOWPACK_PAIRS_WHY)[number];

export interface GlacierSnowpackPair {
  /** glacier id, station id (as in the station line), network (prefix of the id) */
  g: string;
  s: string;
  net: string;
  /** from the station mapping: km to the glacier outline, station elevation minus the glacier's median elevation (m) */
  km: number;
  dz: number;
  /** station elevation (m) */
  z: number;
  /** station elevation against the row: below the tongue, between tongue and top, above the top */
  at: PairsAt;
  /** COMPUTED: snow depth (cm) and new snow of the last 24 / 48 / 72 h (cm) of the snowpack at the station elevation, at the run hour */
  m: number;
  hn: [number, number, number];
  /** MEASURED: snow depth of the station (cm, as the station line has it), minutes from its stamp to the run hour (positive = before) */
  v: number | null;
  age: number | null;
  why?: PairsWhy;
  /** MEASURED, only where the station delivers it (Tirol): change of the snow depth over 24 / 48 / 72 h (cm, as delivered) */
  hsd?: { h24?: number; h48?: number; h72?: number };
}

export interface GlacierSnowpackPairsDoc {
  schema: 1;
  kind: 'glacier/snowpack-pairs';
  run: string;
  runAt: string;
  /** the run hour (ms) the model values belong to */
  atMs: number;
  origin: 'comparison';
  origins: { m: 'computed'; hn: 'computed'; v: 'measured'; hsd: 'measured' };
  note: string;
  coupling: 'none';
  snowpack: { run: string; precip: string; density: string };
  stations: { map: string; slot: string; source: 'glacier/v1/stn' };
  rule: { elevation: 'linear-between-levels-clamped'; windowMin: readonly [number, number]; origin: 'set' };
  counts: { pairs: number; withValue: number; at: Record<PairsAt, number>; why: Partial<Record<PairsWhy, number>>; mappedWithoutRow: number };
  pairs: GlacierSnowpackPair[];
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Contract violations of a pairs document (empty = fine). `rowIds` = the glaciers of the snowpack document of the same run. */
export function snowpackPairsProblems(d: GlacierSnowpackPairsDoc, rowIds?: ReadonlySet<string>): string[] {
  if (d?.kind !== 'glacier/snowpack-pairs' || d.schema !== 1) return ['kind/schema'];
  const p: string[] = [];
  if (!/^\d{10}$/.test(d.run)) p.push('run');
  if (!fin(d.atMs) || d.atMs % 3_600_000) p.push('atMs');
  if (d.origin !== 'comparison') p.push('origin');
  if (d.origins?.m !== 'computed' || d.origins?.hn !== 'computed' || d.origins?.v !== 'measured' || d.origins?.hsd !== 'measured') p.push('origins');
  if (d.note !== GLACIER_SNOWPACK_PAIRS_NOTE) p.push('note');
  if (d.coupling !== 'none') p.push('coupling');
  if (!d.stations?.map || !d.stations?.slot) p.push('stations');
  if (d.rule?.windowMin?.[0] !== GLACIER_SNOWPACK_PAIRS_WINDOW_MIN[0] || d.rule?.windowMin?.[1] !== GLACIER_SNOWPACK_PAIRS_WINDOW_MIN[1]) p.push('rule');
  if (!Array.isArray(d.pairs)) return [...p, 'pairs'];
  const seen = new Set<string>();
  let withValue = 0;
  const at: Record<string, number> = { below: 0, inside: 0, above: 0 }, why: Record<string, number> = {};
  for (const r of d.pairs) {
    const k = `${r.g}|${r.s}`;
    if (seen.has(k)) p.push(`${k}: doppelt`);
    seen.add(k);
    if (rowIds && !rowIds.has(r.g)) p.push(`${r.g}: ohne Zeile der Schneedecke`);
    if (r.net !== r.s.split(':')[0]) p.push(`${k}: Netz`);
    if (!fin(r.km) || r.km < 0 || !fin(r.dz) || !fin(r.z)) p.push(`${k}: Zuordnung`);
    if (!GLACIER_SNOWPACK_PAIRS_AT.includes(r.at)) p.push(`${k}: Lage`);
    else at[r.at]++;
    if (!fin(r.m) || r.m < 0) p.push(`${k}: Modellwert`);
    if (!Array.isArray(r.hn) || r.hn.length !== 3 || !r.hn.every((x) => fin(x) && x >= 0) || r.hn[0] > r.hn[1] + 0.15 || r.hn[1] > r.hn[2] + 0.15) p.push(`${k}: Neuschnee`);
    if (r.v === null) {
      if (r.age !== null && !fin(r.age)) p.push(`${k}: Alter`);
      if (!r.why || !GLACIER_SNOWPACK_PAIRS_WHY.includes(r.why)) p.push(`${k}: ohne Wert, ohne Grund`);
      else why[r.why] = (why[r.why] ?? 0) + 1;
    } else {
      if (!fin(r.v)) p.push(`${k}: Stationswert`);
      if (!fin(r.age) || r.age > GLACIER_SNOWPACK_PAIRS_WINDOW_MIN[0] || r.age < -GLACIER_SNOWPACK_PAIRS_WINDOW_MIN[1]) p.push(`${k}: Stationswert außerhalb des Fensters`);
      if (r.why !== undefined) p.push(`${k}: Wert mit Grund`);
      withValue++;
    }
    if (r.hsd !== undefined && !(r.hsd && Object.entries(r.hsd).every(([kk, x]) => ['h24', 'h48', 'h72'].includes(kk) && fin(x)))) p.push(`${k}: Änderung der Schneehöhe`);
  }
  const c = d.counts;
  if (!c || c.pairs !== d.pairs.length || c.withValue !== withValue || GLACIER_SNOWPACK_PAIRS_AT.some((a) => c.at?.[a] !== at[a]) || GLACIER_SNOWPACK_PAIRS_WHY.some((w) => (c.why?.[w] ?? 0) !== (why[w] ?? 0)) || !(Number.isInteger(c.mappedWithoutRow) && c.mappedWithoutRow >= 0)) p.push('counts');
  return p;
}
