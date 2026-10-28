/**
 * AW-6.2.7 — the PRODUCT of the virtual road sensor (`buscosun-data/road/vs/v1/<run>/…`, `audit/autobahnwetter.md` §20.13):
 * per point and hour 0 … 48 the road temperature with σ and origin, the bridge temperature, the stores, the water film, the
 * condition, the slipperiness word, the grip class, the scenario, the visibility probabilities and the cold-start mark.
 * ONE file for the derive (`scripts/road/vs/run-vs.mjs`), the client (behind `ROAD_VS_LIVE`, 6.2.7) and the verifier.
 * Dependency-free. Additive to `road/fc/v1` (own path, own schema): nothing of the route forecast changes.
 *
 * Origin per value (Startprompt): `gemessen` (a valid GMA value at hour 0), `gekoppelt` (model coupled to a measurement ≤ 6 h
 * old), `modelliert` (model with site correction), `unbekannt` (no current run / no forcing / QC rejected everything).
 */

export const ROAD_VS_PRODUCT_SCHEMA = 1;
export const ROAD_VS_PRODUCT = 'road-vs';
export const ROAD_VS_INDEX_PATH = 'index.json';
export const ROAD_VS_STATE_PATH = 'state.json.gz';
export const ROAD_VS_RESIDUALS_PATH = 'static/residuals.json';
export const ROAD_VS_SHADOW_DIR = 'shadow';
export const roadVsRunDirName = (run: string) => run;
export const roadVsCorridorPath = (run: string, corridor: string) => `${run}/c/${corridor}.json`;
export const roadVsStatePath = (run: string, state: string) => `${run}/s/${state}.json`;
export const roadVsShadowPath = (run: string) => `${ROAD_VS_SHADOW_DIR}/${run}.jsonl.gz`;
/** Runs kept in the data repo (the archive keeps the shadow pairs). */
export const ROAD_VS_KEEP_RUNS = 3;
/** Snapshots of the state kept per point for the coupling window (hours; 6 = coupling age limit). */
export const ROAD_VS_HISTORY_H = 6;

export const ROAD_VS_SRC = Object.freeze({ gemessen: 0, gekoppelt: 1, modelliert: 2, unbekannt: 3 } as const);
export type RoadVsSrc = keyof typeof ROAD_VS_SRC;
export const ROAD_VS_SRC_LABEL: Readonly<Record<RoadVsSrc, string>> = Object.freeze({ gemessen: 'gemessen', gekoppelt: 'gekoppelt', modelliert: 'modelliert', unbekannt: 'unbekannt' });
export const roadVsSrcOf = (code: number | null | undefined): RoadVsSrc | null => (Object.entries(ROAD_VS_SRC).find(([, v]) => v === code)?.[0] as RoadVsSrc | undefined) ?? null;

export const ROAD_VS_CONDITION_CODE = Object.freeze({ trocken: 0, feucht: 1, nass: 2, reifglaette: 3, eis: 4, schneematsch: 5, schneeglaette: 6, glatteis: 7 } as const);
export const ROAD_VS_GRIP_CODE = Object.freeze({ griffig: 0, eingeschraenkt: 1, glatt: 2, 'sehr-glatt': 3 } as const);

/** Series of a point (integer coding like `road/fc`): id → scale, unit, what. Every series has `steps` entries, null = unknown. */
export const ROAD_VS_VARS = Object.freeze({
  tf: { scale: 10, unit: '°C', what: 'Fahrbahntemperatur' },
  tf_sigma: { scale: 10, unit: 'K', what: 'Streuung der Fahrbahntemperatur' },
  tf_src: { scale: 1, unit: 'code', what: 'Herkunft: 0 gemessen, 1 gekoppelt, 2 modelliert, 3 unbekannt' },
  tf_bruecke: { scale: 10, unit: '°C', what: 'Fahrbahntemperatur der Brückensäule (nur Brückenpunkte)' },
  wasser_mm: { scale: 100, unit: 'mm', what: 'Wasserspeicher (Film + Poren)' },
  schnee_mm: { scale: 100, unit: 'mm', what: 'Schneespeicher (Wasseräquivalent)' },
  eis_mm: { scale: 100, unit: 'mm', what: 'Eisspeicher' },
  reif_mm: { scale: 1000, unit: 'mm', what: 'Reifspeicher' },
  wasserfilm_mm: { scale: 1000, unit: 'mm', what: 'Wasserfilm (Gallaway bei Regen, sonst Speicher)' },
  zustand: { scale: 1, unit: 'code', what: 'Zustand: 0 trocken 1 feucht 2 nass 3 Reifglätte 4 Eis/überfr. Nässe 5 Schneematsch 6 Schneeglätte 7 Glatteis' },
  glaette_p: { scale: 1, unit: '%', what: 'Glättepotenzial ohne Streuung (v1 grob 0/50/100)' },
  griff: { scale: 1, unit: 'code', what: 'Griff: 0 griffig 1 eingeschränkt 2 glatt 3 sehr glatt' },
  vis_p1000: { scale: 1, unit: '%', what: 'P(Sicht < 1 000 m)' },
  vis_p300: { scale: 1, unit: '%', what: 'P(Sicht < 300 m)' },
  vis_p150: { scale: 1, unit: '%', what: 'P(Sicht < 150 m)' },
  vis_p50: { scale: 1, unit: '%', what: 'P(Sicht < 50 m), Prognose gedeckelt 50 %' },
  vis_src: { scale: 1, unit: 'code', what: 'Herkunft der Sicht: 0 gemessen, 2 modelliert, 3 unbekannt' },
} as const);
export type RoadVsVar = keyof typeof ROAD_VS_VARS;
export const ROAD_VS_VAR_IDS = Object.freeze(Object.keys(ROAD_VS_VARS) as RoadVsVar[]);
export const ROAD_VS_PRODUCT_RANGE: Readonly<Record<RoadVsVar, readonly [number, number]>> = Object.freeze({
  tf: [-40, 75], tf_sigma: [0, 20], tf_src: [0, 3], tf_bruecke: [-40, 75], wasser_mm: [0, 2], schnee_mm: [0, 100], eis_mm: [0, 50], reif_mm: [0, 2],
  wasserfilm_mm: [0, 20], zustand: [0, 7], glaette_p: [0, 100], griff: [0, 3], vis_p1000: [0, 100], vis_p300: [0, 100], vis_p150: [0, 100], vis_p50: [0, 100], vis_src: [0, 3],
});
export const roadVsProductEncode = (v: RoadVsVar, x: number | null | undefined): number | null => {
  if (x == null || !Number.isFinite(x)) return null;
  const [lo, hi] = ROAD_VS_PRODUCT_RANGE[v];
  const c = Math.max(lo, Math.min(hi, x));
  return Math.round(c * ROAD_VS_VARS[v].scale);
};
export const roadVsProductDecode = (v: RoadVsVar, i: number | null | undefined): number | null => (i == null || !Number.isFinite(i) ? null : i / ROAD_VS_VARS[v].scale);

export interface RoadVsProductPoint {
  id: string;
  kind: 'axis' | 'station';
  lat: number;
  lon: number;
  bridge: boolean;
  /** Cold start: the column is younger than the spin-up (Startprompt: marked in the output field). */
  kaltstart: boolean;
  /** Coupling of this point: factor, mode, measurement age (h) — absent without coupling. */
  couple?: { c: number; mode: 'sw' | 'lw'; ageH: number; converged: boolean };
  /** Site correction applied: own station cell or neighbours (ids) — absent without. */
  corr?: { k: number; from: 'station' | 'neighbours'; n: number };
  szenario: 'ungestreut';
  v: Record<RoadVsVar, Array<number | null>>;
}

export interface RoadVsProductFile {
  schema: 1;
  product: 'road-vs';
  /** ICON-D2 run of the forcing (`YYYYMMDDHH`) and the hour the series start at (t0 = run hour). */
  run: string;
  t0Ms: number;
  issuedAt: string;
  steps: number;
  kind: 'corridor' | 'state';
  id: string;
  engine: {
    core: 'roadsurf-ts-1';
    forcing: { run: string; ruc: string | null; missing: string[] };
    drive: 'fusion+icon' | 'icon';
    fusionRun: string | null;
    obsSlot: string | null;
    residuals: { table: string | null; calibrated: boolean } | null;
    vis: { calibrated: boolean };
    points: { total: number; coupled: number; measured: number; coldStart: number; corrected: number };
    live: false;
  };
  source: string;
  points: RoadVsProductPoint[];
}

export interface RoadVsIndex {
  schema: 1;
  product: 'road-vs-index';
  updatedAt: string;
  killed: boolean;
  runs: Array<{ run: string; t0Ms: number; issuedAt: string; points: number; coupled: number; coldStart: number; corridors: number; states: number; ms: number }>;
}

export const ROAD_VS_PRODUCT_SOURCE = 'buscosun — virtueller Fahrbahnsensor (Schattenbetrieb): Energiebilanzmodell nach RoadSurf (FMI, MIT) auf ICON-D2 (DWD, CC BY 4.0) und buscosun Fusion, gekoppelt an Glättemeldeanlagen (DWD/Länder, GeoNutzV); Ortsmerkmale Copernicus DEM GLO-30, OpenStreetMap (ODbL)';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Every reason a product file is unusable (the derive refuses to publish one with problems). */
export function roadVsProductProblems(j: unknown): string[] {
  if (!isObj(j)) return ['kein Objekt'];
  const out: string[] = [];
  if (j.schema !== ROAD_VS_PRODUCT_SCHEMA || j.product !== ROAD_VS_PRODUCT) out.push('Kopf');
  if (typeof j.run !== 'string' || !/^\d{10}$/.test(j.run) || typeof j.t0Ms !== 'number') out.push('run/t0Ms');
  if (typeof j.steps !== 'number' || j.steps < 1) out.push('steps');
  if (!isObj(j.engine) || j.engine.live !== false) out.push('engine (live muss false sein — Schattenbetrieb)');
  if (!Array.isArray(j.points) || !j.points.length) { out.push('points'); return out; }
  let bad = 0;
  for (const p of j.points as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.kaltstart !== 'boolean' || p.szenario !== 'ungestreut' || !isObj(p.v)) { bad++; continue; }
    for (const id of ROAD_VS_VAR_IDS) {
      const a = (p.v as Record<string, unknown>)[id];
      if (!Array.isArray(a) || a.length !== j.steps) { bad++; break; }
      const [lo, hi] = ROAD_VS_PRODUCT_RANGE[id];
      if (!a.every((x) => x === null || (Number.isInteger(x) && x / ROAD_VS_VARS[id].scale >= lo && x / ROAD_VS_VARS[id].scale <= hi))) { bad++; break; }
    }
  }
  if (bad) out.push(`${bad} Punkte mit falscher Form`);
  return out;
}
export const parseRoadVsProduct = (j: unknown): RoadVsProductFile | null => (roadVsProductProblems(j).length ? null : (j as RoadVsProductFile));

/**
 * Display rule (behind ROAD_VS_LIVE, Startprompt 6.2.7): a valid measurement shows the measurement; an outage < 6 h shows the
 * coupled model with „Sensor aus seit hh:mm"; longer or without GMA the model with site correction and wider σ; without a
 * current run „unbekannt". Pure: words only, the page decides where to put them.
 */
export function roadVsDisplay(src: RoadVsSrc | null, opts: { sensorOffSinceMs?: number | null; nowMs?: number; runAgeH?: number | null } = {}): { word: string; detail: string | null } {
  if (src == null || src === 'unbekannt') return { word: 'unbekannt', detail: opts.runAgeH == null ? 'kein aktueller Lauf' : 'Pflichteingang fehlt' };
  if (src === 'gemessen') return { word: 'gemessen', detail: null };
  if (src === 'gekoppelt') {
    const since = opts.sensorOffSinceMs != null ? new Date(opts.sensorOffSinceMs) : null;
    const hhmm = since ? `${String(since.getUTCHours()).padStart(2, '0')}:${String(since.getUTCMinutes()).padStart(2, '0')} UTC` : null;
    return { word: 'berechnet · gekoppelt', detail: hhmm ? `Sensor aus seit ${hhmm}` : 'an die letzte Messung gekoppelt' };
  }
  return { word: 'berechnet', detail: 'Modell mit Standortkorrektur, breitere Streuung' };
}
