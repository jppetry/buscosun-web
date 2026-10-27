/**
 * AW-6.2 „Virtueller Fahrbahnsensor" (VS, `audit/autobahnwetter.md` §20) — contract of the FORCING product
 * `buscosun-data/road/vs/v1/forcing/<run>.json.gz`: the meteorological drive of the road energy balance at every point of
 * `road/fc/v1/static/points.json`, sampled from ICON-D2 on the DWD v1 path (icosahedral grid, nearest cell) and, for the
 * visibility until 30.11.2026, from ICON-D2-RUC. ONE file for the producer (`scripts/road/vs/build-forcing.mjs`), the
 * model (AW-6.2.3) and the verifier (`verify:road-vs`). Dependency-free — Node (strip-types) and browser alike.
 *
 * Conventions written into the product (so no reader has to know the GRIB):
 *   - every step is the hour `t0 + i h`, i = 0 … ROAD_VS_STEPS − 1 (lead 0 … 48 h) of the ICON-D2 run;
 *   - fields of kind `avg` (radiation) are the MEAN OVER THE HOUR ENDING at the step; the GRIB carries means since model
 *     start (spike 20.2 e: PDT 4.8, forecastTime 0, interval 0 → step) and the producer de-averages them with
 *     `intervalFromStartMeans`; step 0 has no hour before it and is null;
 *   - fields of kind `acc` (FRZ_RAIN) are the AMOUNT OF THE HOUR ending at the step (GRIB: accumulation since start);
 *   - `lwdown` is RECONSTRUCTED: LW↓ = ATHB_S_hour / ε_s + σ·T_G⁴ with ε_s = ROAD_VS_SURFACE_EMISSIVITY (`set`, V-VS-5);
 *   - a missing file or an unreadable value is `null`, never a filler (D-04).
 */

export const ROAD_VS_VERSION = 'v1';
export const ROAD_VS_REPO_DIR = `road/vs/${ROAD_VS_VERSION}`;
export const ROAD_VS_FORCING_SCHEMA = 1;
export const ROAD_VS_FORCING_PRODUCT = 'road-vs-forcing';
export const ROAD_VS_FORCING_INDEX_PATH = 'forcing/index.json';
export const ROAD_VS_CELLS_PATH = 'static/cells.json';
export const roadVsForcingPath = (run: string) => `forcing/${run}.json.gz`;
/** Runs kept in the data repo (the model state carries the past; the archive job may thin further). */
export const ROAD_VS_FORCING_KEEP = 3;

export const ROAD_VS_DWD_V1_BASE = 'https://opendata.dwd.de/weather/nwp/v1/m';
export const ROAD_VS_MODEL = 'icon-d2';
export const ROAD_VS_RUC_MODEL = 'icon-d2-ruc';
/** ICON-D2 runs every 3 h; 0 … 48 h hourly. */
export const ROAD_VS_RUN_SLOT_H = 3;
export const ROAD_VS_STEPS = 49;
/** RUC: hourly runs, +27 h; only the hourly steps are read (VIS until 30.11.2026, DWD newsletter 09/2026 — spike 20.2 i). */
export const ROAD_VS_RUC_STEPS = 28;
export const ROAD_VS_RUC_VIS_ENDS = '2026-11-30T23:59:59Z';

/** Surface emissivity used to turn the net thermal flux into LW↓ (`set`, Startprompt 27.10.2026 / RoadSurf; V-VS-5). */
export const ROAD_VS_SURFACE_EMISSIVITY = 0.95;
export const STEFAN_BOLTZMANN = 5.670374419e-8;
export const KELVIN = 273.15;

export type RoadVsFieldKind = 'inst' | 'avg' | 'acc' | 'derived';

export interface RoadVsFieldDef {
  /** DWD parameter short name (directory under `p/`); null for derived fields. */
  param: string | null;
  /** Level-type directory `lvt1/<type>/lv1/<level>` for multi-level parameters (spike 20.2 c). */
  level?: { lvt: number; lv: string };
  model?: typeof ROAD_VS_MODEL | typeof ROAD_VS_RUC_MODEL;
  kind: RoadVsFieldKind;
  unit: string;
  /** Integer coding: stored = round(value · scale). */
  scale: number;
  /** Conversion from the GRIB unit to `unit` (K → °C, kg m⁻² s⁻¹ → mm/h, kg/kg → mg/kg). */
  conv?: 'k2c' | 'rate2mmh' | 'kgkg2mgkg';
  what: string;
}

/**
 * The fields of the product. Order = order in the file. `prr`/`prs`/`prg` are instantaneous rates in ICON (kg m⁻² s⁻¹);
 * the producer checks the GRIB template of each field on every run and refuses a field whose template contradicts
 * `kind` (a silently wrong convention would feed the model a wrong drive).
 */
export const ROAD_VS_FIELDS = Object.freeze({
  t2m:    { param: 'T_2M',      kind: 'inst', unit: '°C',    scale: 10,  conv: 'k2c',       what: 'Lufttemperatur 2 m' },
  td2m:   { param: 'TD_2M',     kind: 'inst', unit: '°C',    scale: 10,  conv: 'k2c',       what: 'Taupunkt 2 m' },
  rh2m:   { param: 'RELHUM_2M', kind: 'inst', unit: '%',     scale: 1,                      what: 'relative Feuchte 2 m' },
  u10:    { param: 'U_10M',     kind: 'inst', unit: 'm/s',   scale: 10,                     what: 'Wind 10 m, u' },
  v10:    { param: 'V_10M',     kind: 'inst', unit: 'm/s',   scale: 10,                     what: 'Wind 10 m, v' },
  swdir:  { param: 'ASWDIR_S',  kind: 'avg',  unit: 'W/m²',  scale: 1,                      what: 'direkte Sonnenstrahlung am Boden, Stundenmittel' },
  swdif:  { param: 'ASWDIFD_S', kind: 'avg',  unit: 'W/m²',  scale: 1,                      what: 'diffuse Sonnenstrahlung abwärts, Stundenmittel' },
  lwnet:  { param: 'ATHB_S',    kind: 'avg',  unit: 'W/m²',  scale: 1,                      what: 'Netto-Thermalstrahlung am Boden (negativ = Abkühlung), Stundenmittel' },
  tg:     { param: 'T_G',       kind: 'inst', unit: '°C',    scale: 10,  conv: 'k2c',       what: 'Bodenoberflächentemperatur des Modells' },
  tso0:   { param: 'T_SO',      kind: 'inst', unit: '°C',    scale: 10,  conv: 'k2c', level: { lvt: 106, lv: '0.0' },  what: 'Bodentemperatur 0 m' },
  tso54:  { param: 'T_SO',      kind: 'inst', unit: '°C',    scale: 10,  conv: 'k2c', level: { lvt: 106, lv: '0.54' }, what: 'Bodentemperatur 0,54 m' },
  tso162: { param: 'T_SO',      kind: 'inst', unit: '°C',    scale: 10,  conv: 'k2c', level: { lvt: 106, lv: '1.62' }, what: 'Bodentemperatur 1,62 m' },
  prr:    { param: 'PRR_GSP',   kind: 'inst', unit: 'mm/h',  scale: 100, conv: 'rate2mmh',  what: 'Regenrate (skalig)' },
  prs:    { param: 'PRS_GSP',   kind: 'inst', unit: 'mm/h',  scale: 100, conv: 'rate2mmh',  what: 'Schneerate (skalig)' },
  prg:    { param: 'PRG_GSP',   kind: 'inst', unit: 'mm/h',  scale: 100, conv: 'rate2mmh',  what: 'Graupelrate (skalig)' },
  frz:    { param: 'FRZ_RAIN',  kind: 'acc',  unit: 'mm',    scale: 100,                    what: 'gefrierender Regen der Stunde (Lesart aus dem GRIB-Kopf, V-VS-3)' },
  clct:   { param: 'CLCT',      kind: 'inst', unit: '%',     scale: 1,                      what: 'Gesamtbedeckung' },
  clcl:   { param: 'CLCL',      kind: 'inst', unit: '%',     scale: 1,                      what: 'tiefe Bewölkung' },
  ww:     { param: 'WW',        kind: 'inst', unit: 'code',  scale: 1,                      what: 'signifikantes Wetter (WMO 4677)' },
  ceil:   { param: 'CEILING',   kind: 'inst', unit: 'm',     scale: 1,                      what: 'Wolkenuntergrenze' },
  qc:     { param: 'QC',        kind: 'inst', unit: 'mg/kg', scale: 1,   conv: 'kgkg2mgkg', level: { lvt: 150, lv: '65' }, what: 'Wolkenwasser, unterste Modellfläche' },
  qr:     { param: 'QR',        kind: 'inst', unit: 'mg/kg', scale: 1,   conv: 'kgkg2mgkg', level: { lvt: 150, lv: '65' }, what: 'Regenwasser, unterste Modellfläche' },
  qs:     { param: 'QS',        kind: 'inst', unit: 'mg/kg', scale: 1,   conv: 'kgkg2mgkg', level: { lvt: 150, lv: '65' }, what: 'Schnee, unterste Modellfläche' },
  qg:     { param: 'QG',        kind: 'inst', unit: 'mg/kg', scale: 1,   conv: 'kgkg2mgkg', level: { lvt: 150, lv: '65' }, what: 'Graupel, unterste Modellfläche' },
  tch:    { param: 'TCH',       kind: 'inst', unit: '1',     scale: 100000,                 what: 'Transferkoeffizient Wärme (Vergleich zur eigenen Iteration)' },
  vis:    { param: 'VIS', model: 'icon-d2-ruc', kind: 'inst', unit: 'm', scale: 1,           what: 'Sichtweite ICON-D2-RUC (bis 30.11.2026, nur Lauf-Stunden 0 … 27)' },
  lwdown: { param: null,        kind: 'derived', unit: 'W/m²', scale: 1,                    what: 'Gegenstrahlung LW↓ = ATHB_S/ε_s + σ·T_G⁴, Stundenmittel' },
} as const satisfies Record<string, RoadVsFieldDef>);

export type RoadVsField = keyof typeof ROAD_VS_FIELDS;
export const ROAD_VS_FIELD_IDS = Object.freeze(Object.keys(ROAD_VS_FIELDS) as RoadVsField[]);
export const roadVsFieldDef = (id: RoadVsField): RoadVsFieldDef => ROAD_VS_FIELDS[id];

/** Plausible range per field after conversion (a value outside is null AND counted — a unit mistake must show). */
export const ROAD_VS_RANGE: Readonly<Record<RoadVsField, readonly [number, number]>> = Object.freeze({
  t2m: [-50, 50], td2m: [-60, 40], rh2m: [0, 100], u10: [-80, 80], v10: [-80, 80],
  swdir: [0, 1200], swdif: [0, 800], lwnet: [-300, 200], tg: [-60, 80], tso0: [-60, 80], tso54: [-30, 50], tso162: [-20, 40],
  prr: [0, 300], prs: [0, 300], prg: [0, 300], frz: [0, 100], clct: [0, 100], clcl: [0, 100], ww: [0, 99], ceil: [0, 30000],
  qc: [0, 20000], qr: [0, 50000], qs: [0, 50000], qg: [0, 50000], tch: [0, 10], vis: [0, 100000], lwdown: [50, 600],
});

export const roadVsEncode = (id: RoadVsField, x: number | null | undefined): number | null => {
  if (x == null || !Number.isFinite(x)) return null;
  const [lo, hi] = ROAD_VS_RANGE[id];
  if (x < lo || x > hi) return null;
  return Math.round(x * ROAD_VS_FIELDS[id].scale);
};
export const roadVsDecode = (id: RoadVsField, i: number | null | undefined): number | null =>
  (i == null || !Number.isFinite(i) ? null : i / ROAD_VS_FIELDS[id].scale);

/** GRIB value → product unit. */
export function roadVsConvert(def: Pick<RoadVsFieldDef, 'conv'>, x: number): number {
  switch (def.conv) {
    case 'k2c': return x - KELVIN;
    case 'rate2mmh': return x * 3600;
    case 'kgkg2mgkg': return x * 1e6;
    default: return x;
  }
}

// --- Physics of the drive -----------------------------------------------------------------------

/**
 * Mean over (t1, t2] from two means since model start: F(t1,t2) = (t2·F(0,t2) − t1·F(0,t1)) / (t2 − t1) — the identity of
 * a time integral, exact for any accumulation or average that starts at 0 (Startprompt AW-6.2.1). `prev` at t1 = 0 is the
 * empty interval: the first hour is the first since-start mean itself. Hours in any unit; null in ⇒ null out.
 */
export function intervalFromStartMeans(prev: number | null, cur: number | null, t1: number, t2: number): number | null {
  if (cur == null || !Number.isFinite(cur) || !(t2 > t1)) return null;
  if (t1 <= 0) return cur;
  if (prev == null || !Number.isFinite(prev)) return null;
  return (t2 * cur - t1 * prev) / (t2 - t1);
}

/** Amount of the interval from two accumulations since start (never negative — a tiny negative is rounding). */
export function amountFromStartAccumulations(prev: number | null, cur: number | null, t1: number): number | null {
  if (cur == null || !Number.isFinite(cur)) return null;
  if (t1 <= 0) return Math.max(0, cur);
  if (prev == null || !Number.isFinite(prev)) return null;
  return Math.max(0, cur - prev);
}

/**
 * LW↓ from the model's net thermal flux at the surface: ATHB_S = ε_s·(LW↓ − σ·T_G⁴) ⇒ LW↓ = ATHB_S/ε_s + σ·T_G⁴.
 * `lwNet` W/m² (negative at night), `tgC` the model ground temperature °C, `eps` the surface emissivity the model used.
 */
export function lwDownFromNet(lwNet: number | null, tgC: number | null, eps: number = ROAD_VS_SURFACE_EMISSIVITY): number | null {
  if (lwNet == null || tgC == null || !Number.isFinite(lwNet) || !Number.isFinite(tgC) || !(eps > 0 && eps <= 1)) return null;
  const tk = tgC + KELVIN;
  return lwNet / eps + STEFAN_BOLTZMANN * tk ** 4;
}

/** Saturation vapour pressure over water, hPa (Magnus, WMO-No. 8 form: 6.112·exp(17.62·t/(243.12+t))). */
export const vapourPressureWaterHpa = (tC: number): number => 6.112 * Math.exp((17.62 * tC) / (243.12 + tC));
/** Saturation vapour pressure over ice, hPa (Magnus over ice: 6.112·exp(22.46·t/(272.62+t))). */
export const vapourPressureIceHpa = (tC: number): number => 6.112 * Math.exp((22.46 * tC) / (272.62 + tC));
/** Frost point °C of a vapour pressure (inverse Magnus over ice) — the threshold of rime, not the dew point (AW-6.2.5). */
export function frostPointC(eHpa: number): number | null {
  if (!(eHpa > 0)) return null;
  const y = Math.log(eHpa / 6.112);
  return (272.62 * y) / (22.46 - y);
}

/**
 * Fallback for LW↓ when ATHB_S is not there (RUC steps, a missing file): clear-sky emissivity after Brunt (1932),
 * ε_clear = a + b·√e (e in hPa), with the cloud factor after Bolz (1949), (1 + c·N²). `literature`, not fitted here — the
 * METRo per-okta table the Startprompt names is in the missing research file; replaced once it is there (§20.0).
 */
export const ROAD_VS_LW_FALLBACK = Object.freeze({ a: 0.52, b: 0.065, c: 0.22 });
export function lwDownBruntBolz(taC: number | null, eHpa: number | null, cloudFrac: number | null): number | null {
  if (taC == null || eHpa == null || !Number.isFinite(taC) || !Number.isFinite(eHpa)) return null;
  const n = cloudFrac == null || !Number.isFinite(cloudFrac) ? 0 : Math.max(0, Math.min(1, cloudFrac));
  const { a, b, c } = ROAD_VS_LW_FALLBACK;
  const eps = Math.min(1, (a + b * Math.sqrt(Math.max(0, eHpa))) * (1 + c * n * n));
  return eps * STEFAN_BOLTZMANN * (taC + KELVIN) ** 4;
}

// --- Files -------------------------------------------------------------------------------------

export type RoadVsSeries = Partial<Record<RoadVsField, Array<number | null>>>;

export interface RoadVsForcingPoint {
  id: string;
  /** ICON-D2 cell index (0-based, scan order of the v1 files) and its distance to the point, km. */
  cell: number;
  dKm: number;
  v: RoadVsSeries;
}

export interface RoadVsForcingFile {
  schema: 1;
  product: 'road-vs-forcing';
  /** ICON-D2 run `YYYYMMDDHH` (UTC). */
  run: string;
  runMs: number;
  builtAt: string;
  model: 'icon-d2';
  steps: number;
  stepH: 1;
  /** What was done to the GRIB: avg/acc fields are hourly intervals; `lwdown` reconstructed with `eps`. */
  conv: { avg: 'interval'; acc: 'interval'; eps: number };
  /** RUC run (`YYYYMMDDHH`) whose hourly VIS was read, with its lead range; null without. */
  ruc: { run: string; steps: number } | null;
  /** sha of the static cells file the points were sampled with. */
  cells: string;
  /** Fields with at least one missing step: field → steps. */
  missing: Partial<Record<RoadVsField, number[]>>;
  /** Values outside `ROAD_VS_RANGE` set to null: field → count. */
  outOfRange: Partial<Record<RoadVsField, number>>;
  source: string;
  points: RoadVsForcingPoint[];
}

export interface RoadVsForcingIndex {
  schema: 1;
  product: 'road-vs-forcing-index';
  updatedAt: string;
  runs: Array<{ run: string; runMs: number; builtAt: string; points: number; bytes: number; missing: string[]; ruc: string | null }>;
}

export interface RoadVsCellsFile {
  schema: 1;
  product: 'road-vs-cells';
  builtAt: string;
  model: 'icon-d2';
  /** Number of cells of the grid the index was built on (542 040 for ICON-D2, spike 20.2 c) — a run on another grid refuses. */
  cells: number;
  /** sha12 of the points file the index was built for. */
  points: string;
  /** point id → [cell index, distance km]. */
  map: Record<string, [number, number]>;
}

export const ROAD_VS_SOURCE_TEXT = 'Deutscher Wetterdienst, ICON-D2 und ICON-D2-RUC (opendata.dwd.de, CC BY 4.0); verändert: auf Punkte abgetastet, Stundenmittel aus Mitteln seit Modellstart, Gegenstrahlung rekonstruiert';

/** `YYYYMMDDHH` of a run ms; `YYYY-MM-DDTHH:00` is the DWD directory name (`encodeURIComponent` for the colon). */
export const roadVsRunStamp = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
};
export const roadVsRunDir = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
};
export function roadVsRunMsOf(stamp: string): number {
  if (!/^\d{10}$/.test(stamp)) return NaN;
  return Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(8, 10));
}
/** `PT001H00M` for lead h. */
export const roadVsStepName = (h: number): string => `PT${String(h).padStart(3, '0')}H00M`;

/** URL of one field at one step on the DWD v1 path. */
export function roadVsFieldUrl(def: RoadVsFieldDef, runMs: number, h: number): string | null {
  if (!def.param) return null;
  const model = def.model ?? ROAD_VS_MODEL;
  const lvl = def.level ? `/lvt1/${def.level.lvt}/lv1/${def.level.lv}` : '';
  return `${ROAD_VS_DWD_V1_BASE}/${model}/p/${def.param}${lvl}/r/${encodeURIComponent(roadVsRunDir(runMs))}/s/${roadVsStepName(h)}.grib2`;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Every reason a forcing file is not usable (empty = fine); the model refuses a file with problems and names them. */
export function roadVsForcingProblems(j: unknown): string[] {
  if (!isObj(j)) return ['kein Objekt'];
  const out: string[] = [];
  if (j.schema !== ROAD_VS_FORCING_SCHEMA || j.product !== ROAD_VS_FORCING_PRODUCT) out.push('Kopf (schema/product)');
  if (typeof j.run !== 'string' || !/^\d{10}$/.test(j.run) || roadVsRunMsOf(j.run) !== j.runMs) out.push('run/runMs');
  if (j.steps !== ROAD_VS_STEPS || j.stepH !== 1) out.push('steps/stepH');
  if (!isObj(j.conv) || j.conv.avg !== 'interval' || j.conv.acc !== 'interval' || typeof j.conv.eps !== 'number') out.push('conv');
  if (!Array.isArray(j.points) || !j.points.length) { out.push('points'); return out; }
  let bad = 0;
  for (const p of j.points as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'string' || !Number.isInteger(p.cell) || !isObj(p.v)) { bad++; continue; }
    for (const id of ROAD_VS_FIELD_IDS) {
      const a = (p.v as Record<string, unknown>)[id];
      if (a === undefined) continue;
      if (!Array.isArray(a) || a.length !== ROAD_VS_STEPS || !a.every((x) => x === null || Number.isInteger(x))) { bad++; break; }
    }
  }
  if (bad) out.push(`${bad} Punkte mit falscher Form`);
  return out;
}

export function parseRoadVsForcing(j: unknown): RoadVsForcingFile | null {
  return roadVsForcingProblems(j).length ? null : (j as RoadVsForcingFile);
}

/** Nearest cell of a point on an unstructured grid with a bucket index (built once per grid, ≈ 0.1° buckets). */
export interface CellIndex { find: (lat: number, lon: number) => { cell: number; dKm: number } | null }
export function buildCellIndex(cellLat: ArrayLike<number>, cellLon: ArrayLike<number>, bucketDeg = 0.1, maxKm = 5): CellIndex {
  const n = cellLat.length;
  const buckets = new Map<string, number[]>();
  const key = (la: number, lo: number) => `${Math.floor(la / bucketDeg)}:${Math.floor(lo / bucketDeg)}`;
  for (let c = 0; c < n; c++) {
    const la = cellLat[c], lo = cellLon[c];
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const k = key(la, lo > 180 ? lo - 360 : lo);
    let b = buckets.get(k);
    if (!b) { b = []; buckets.set(k, b); }
    b.push(c);
  }
  const km2 = (aLa: number, aLo: number, bLa: number, bLo: number) => {
    const dy = (bLa - aLa) * 111.2, dx = (bLo - aLo) * 111.2 * Math.cos((aLa * Math.PI) / 180);
    return dx * dx + dy * dy;
  };
  return {
    find(lat, lon) {
      const by = Math.floor(lat / bucketDeg), bx = Math.floor(lon / bucketDeg);
      let best = -1, bestD = Infinity;
      // The nearest cell of a 2-km grid lies within one bucket ring of 0.1°; a second ring only when the first is empty.
      for (let ring = 1; ring <= 3 && best < 0; ring++) {
        for (let y = by - ring; y <= by + ring; y++) for (let x = bx - ring; x <= bx + ring; x++) {
          const b = buckets.get(`${y}:${x}`);
          if (!b) continue;
          for (const c of b) {
            const lo = cellLon[c] > 180 ? cellLon[c] - 360 : cellLon[c];
            const d = km2(lat, lon, cellLat[c], lo);
            if (d < bestD) { bestD = d; best = c; }
          }
        }
      }
      if (best < 0 || Math.sqrt(bestD) > maxKm) return null;
      return { cell: best, dKm: Math.round(Math.sqrt(bestD) * 100) / 100 };
    },
  };
}
