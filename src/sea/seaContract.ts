/**
 * SW-1 — Contract of the Seewetter data line (`buscosun-data/sea/v1/`): ONE file for producer
 * (`scripts/sea/sea-derive.mjs`, `scripts/sea/sea-text.mjs`), client (`src/sea/seaClient.ts`) and verifiers
 * (`verify:sea-*`) — paths, model grids, PNG channel coding, value/field/run rules, time gates, kill switch.
 * Pattern: `src/road/roadContract.ts`. Every number below is measured in `audit/seewetter.md` §2 (SW-0) or decided
 * at Gate A (§3, E-SW-1 … E-SW-14). Text bulletins (FQDL50/51, WODL45, FXDL40, FQDL60) live in `seaText.ts`.
 *
 * Layout (versioned path — a format change bumps `v1` → `v2`):
 *   sea/v1/status.json                         lines, last run per model, last issue per text, rule balance, block, kill switch
 *   sea/v1/run/<model>/<run>/run.json          run, steps, grid, mask hash, rule balance (written LAST)
 *   sea/v1/run/<model>/<run>/f/<sss>.png       total sea: R = Hs (5 cm), G = direction (256 steps), B = Tm−1,0 (0.1 s), A = water
 *   sea/v1/run/<model>/<run>/c/<sss>.png       components, double width: left wind sea, right swell, channels as f
 *   sea/v1/spots/<run>.json                    hourly series per spot: waves from CWAM, wind/gust from buscosun Fusion
 *   sea/v1/spots/<run>-w<t1>.json              wind/gust/direction of that run again on a newer t1 cube (V-SW-2; pointer `status.wind` = newest; all of a kept run stay, V-SW-15)
 *   sea/v1/text/<product>/<issue>.json         bulletin: raw (verbatim), header, issue time, display text, structure
 *   sea/v1/quarantine/<run|issue>.json         rejected runs/bulletins with rule and raw value (diagnosis only)
 *   sea/v1/static/spots.json                   spot catalogue (E-SW-5)
 *   sea/v1/static/areas.json                   DWD sea areas and coast sections (E-SW-13)
 *   sea/v1/static/mask-<model>.hash            sha256 of the land/sea bitmap per model
 *   sea/v1/static/spot-geo.json                producer-only terrain/z0 at the spot cells (E-SW-11)
 *
 * Run and issue files are immutable (content per path never changes), so `@main` is safe at the CDN; the client
 * derives the expected run/issue from the clock and steps back on 404. The one pointer is `status.wind` (the newest
 * wind refresh), read from `status.json`, which the client fetches raw and uncached anyway (kill switch).
 */

// --- Paths -------------------------------------------------------------------------------------

export const SEA_VERSION = 'v1';
export const SEA_CDN_BASE = `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/sea/${SEA_VERSION}`;
/** Same files on raw.githubusercontent (CORS *): hedge when jsDelivr hangs or answers 403 (pattern NL-2/V-FI-5). */
export const SEA_RAW_BASE = `https://raw.githubusercontent.com/jppetry/buscosun-data/main/sea/${SEA_VERSION}`;
/** Repo-relative directory of the line (producer side). */
export const SEA_REPO_DIR = `sea/${SEA_VERSION}`;

export type SeaModel = 'cwam' | 'ewam' | 'gwam';

const sss = (step: number) => String(step).padStart(3, '0');
export const seaRunDir = (model: SeaModel, run: string) => `run/${model}/${run}`;
export const seaRunJsonPath = (model: SeaModel, run: string) => `${seaRunDir(model, run)}/run.json`;
export const seaFieldPath = (model: SeaModel, run: string, step: number) => `${seaRunDir(model, run)}/f/${sss(step)}.png`;
export const seaCompPath = (model: SeaModel, run: string, step: number) => `${seaRunDir(model, run)}/c/${sss(step)}.png`;
export const seaSpotsPath = (run: string) => `spots/${run}.json`;
/**
 * V-SW-2: the wind of a published wave run, computed again on a newer t1 cube (`sea-derive.mjs --wind`). Named by the
 * wave run and the t1 run; `status.json` → `wind` points at the newest one (the client lists nothing).
 */
export const seaSpotsWindPath = (run: string, t1: string) => `spots/${run}-w${t1}.json`;
export const SEA_SPOTS_WIND_RE = /^(\d{10})-w(\d{10})\.json$/;
export const seaTextPath = (product: string, issue: string) => `text/${product}/${issue}.json`;
export const seaQuarantinePath = (key: string) => `quarantine/${key}.json`;
export const seaMaskHashPath = (model: SeaModel) => `static/mask-${model}.hash`;
export const SEA_STATUS_PATH = 'status.json';
export const SEA_SPOT_CATALOG_PATH = 'static/spots.json';
export const SEA_AREAS_PATH = 'static/areas.json';
/** Producer-only: terrain/z0 cache entries at the spot cells (E-SW-11), never read by the client. */
export const SEA_SPOT_GEO_PATH = 'static/spot-geo.json';

// --- Models (SW-0 §2.1, measured on run 2026100700) --------------------------------------------

export interface SeaGrid {
  ni: number; nj: number;
  /** Centre of the first cell (north-west), scan mode 0: rows run north → south, columns west → east. */
  lat1: number; lon1: number;
  /** Centre of the last cell (south-east). */
  lat2: number; lon2: number;
  di: number; dj: number;
}

export interface SeaModelSpec {
  model: SeaModel;
  grid: SeaGrid;
  /** Sea points (bitmap set) — every field of every step, one mask per model (SW-0: one FNV over 78 fields). */
  seaPoints: number;
  /** Files per run in the DWD inventory: 13 parameters × `steps.length`. */
  steps: readonly number[];
  /** Run complete after this many minutes past run start (SW-0 §2.2, inventory, four runs each). */
  completeMin: number;
}

const hourly = (from: number, to: number, every = 1) => Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, k) => from + k * every);

export const SEA_MODELS: Readonly<Record<SeaModel, SeaModelSpec>> = Object.freeze({
  cwam: {
    model: 'cwam', seaPoints: 124_011, steps: hourly(0, 78), completeMin: 247,
    grid: { ni: 630, nj: 387, lat1: 56.445835, lon1: 6.173611, lat2: 53.229168, lon2: 14.909722, di: 0.013889, dj: 0.008333 },
  },
  ewam: {
    model: 'ewam', seaPoints: 138_388, steps: hourly(0, 78), completeMin: 233,
    grid: { ni: 526, nj: 721, lat1: 66, lon1: -10.5, lat2: 30, lon2: 42, di: 0.1, dj: 0.05 },
  },
  gwam: {
    model: 'gwam', seaPoints: 686_000, steps: hourly(0, 174, 3), completeMin: 251,
    grid: { ni: 1440, nj: 699, lat1: 89.25, lon1: 0, lat2: -85.25, lon2: 359.75, di: 0.25, dj: 0.25 },
  },
});

/** Stage 1 publishes CWAM only (E-SW-2); EWAM is read for the observation-only cross check. */
export const SEA_STAGE1_MODEL: SeaModel = 'cwam';

/** The 13 DWD parameters (folder names), GRIB2 discipline/category/number (datenpruefung §3). */
export const SEA_PARAMS = Object.freeze([
  'swh', 'mwd', 'tm10', 'shww', 'mdww', 'mpww', 'ppww', 'shts', 'mdts', 'mpts', 'ppts', 'sp_10m', 'dd_10m',
] as const);
export type SeaParam = typeof SEA_PARAMS[number];
export const SEA_PARAM_IDS: Readonly<Record<SeaParam, [number, number, number]>> = Object.freeze({
  swh: [10, 0, 3], mwd: [10, 0, 14], tm10: [10, 0, 15], shww: [10, 0, 5], mdww: [10, 0, 4], mpww: [10, 0, 6],
  ppww: [10, 0, 35], shts: [10, 0, 8], mdts: [10, 0, 7], mpts: [10, 0, 9], ppts: [10, 0, 36], sp_10m: [0, 2, 1], dd_10m: [0, 2, 0],
});
/**
 * Parameters the producer downloads (11). `sp_10m`/`dd_10m` — the WAM forcing wind with its hard floor at exactly
 * 2.00 m/s (SW-0: 7 487 points at +24 h, 65 770 at +0 h) — are NEVER published and not even downloaded; the run is
 * still complete only when the inventory lists all 13 × steps (plan rule).
 */
export const SEA_PARAMS_READ = Object.freeze(SEA_PARAMS.filter((p) => p !== 'sp_10m' && p !== 'dd_10m'));
/** Never published, anywhere (plan rule, honesty: WAM model wind is never shown as wind). */
export const SEA_PARAMS_NEVER = Object.freeze(['sp_10m', 'dd_10m'] as const);

export const SEA_DWD_BASE = 'https://opendata.dwd.de/weather/maritime';
export const SEA_INVENTORY_URL = `${SEA_DWD_BASE}/content.log.bz2`;

/** DWD file of one parameter/step: `wave_models/<m>/grib/<HH>/<param>/<M>_<PARAM>_<YYYYMMDDHH>_<SSS>.grib2.bz2`. */
export function seaGribPath(model: SeaModel, run: string, param: SeaParam, step: number): string {
  return `wave_models/${model}/grib/${run.slice(8, 10)}/${param}/${model.toUpperCase()}_${param.toUpperCase()}_${run}_${sss(step)}.grib2.bz2`;
}
export const seaGribUrl = (model: SeaModel, run: string, param: SeaParam, step: number) => `${SEA_DWD_BASE}/${seaGribPath(model, run, param, step)}`;

// --- Runs and steps ----------------------------------------------------------------------------

/** Wave runs: 00 and 12 UTC. Stamp `YYYYMMDDHH` (the DWD's own). */
export const SEA_RUN_EVERY_MS = 12 * 3_600_000;
const two = (n: number) => String(n).padStart(2, '0');
export function seaRunStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}`;
}
export function seaRunMs(run: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(run);
  if (!m) return NaN;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
  return seaRunStamp(ms) === run && (+m[4] === 0 || +m[4] === 12) ? ms : NaN;
}
export const seaRunOf = (ms: number) => Math.floor(ms / SEA_RUN_EVERY_MS) * SEA_RUN_EVERY_MS;

/** `f/`: hourly 0–48 h, then three-hourly to 78 h (59 steps, plan SW-2). */
export const SEA_F_STEPS: readonly number[] = Object.freeze([...hourly(0, 48), ...hourly(51, 78, 3)]);
/** `c/`: three-hourly 0–78 h (27 steps). */
export const SEA_C_STEPS: readonly number[] = Object.freeze(hourly(0, 78, 3));
/** Spot series: every hour of the run, 0–78 h (stage 1; GWAM outlook = SW-8). */
export const SEA_SPOT_STEPS: readonly number[] = Object.freeze(hourly(0, 78));

/** The `f/` step at or before a lead hour (three-hourly beyond 48 h). */
export function seaFieldStepAt(leadH: number): number | null {
  if (!Number.isFinite(leadH) || leadH < 0 || leadH > 78) return null;
  let best: number | null = null;
  for (const s of SEA_F_STEPS) if (s <= leadH) best = s;
  return best;
}
/** The nearest `c/` step (three-hourly). */
export function seaCompStepAt(leadH: number): number | null {
  if (!Number.isFinite(leadH) || leadH < 0 || leadH > 78) return null;
  return Math.min(78, Math.round(leadH / 3) * 3);
}

// --- Producer timing ---------------------------------------------------------------------------

/**
 * The workflow runs every 15 min (E-SW-4/E-SW-10) and builds a run once the inventory lists it complete
 * (CWAM + 4:07 h measured). Runs older than this are not built any more (the DWD keeps 48 h; the previous run is
 * the fallback the client steps back to).
 */
export const SEA_BUILD_MAX_AGE_MS = 30 * 3_600_000;

// --- Client timing (time gate, staleness; plan SW-1 client rules) -------------------------------

/**
 * The client asks for run R only from R + 5 h on: complete + 4:07 h, + workflow cadence 15 min, + GitHub start delay
 * (7–31 min measured for the road line), + build ≈ 5 min, + jsDelivr `@main` ≤ 3 min. Gate B measures how many runs
 * make it (target ≥ 95 % before R + 5 h); a request before the publish costs a sticky edge 404 — hence the raw hedge.
 */
export const SEA_RUN_GATE_MS = 5 * 3_600_000;
/** On 404 the client steps back one run at a time, at most this many (24 h). */
export const SEA_MAX_STEP_BACK = 2;
/** Plan: run older than 18 h ⇒ "veraltet". */
export const SEA_STALE_MS = 18 * 3_600_000;
/** Plan: run older than 30 h or kill switch ⇒ "Keine Daten", no surfaces. */
export const SEA_DEAD_MS = 30 * 3_600_000;

export type SeaFreshness = 'live' | 'stale' | 'dead';
/** Age = now − run start (the run's analysis time), as in the plan's client rules. */
export function seaFreshness(runMs: number, nowMs: number, killed = false): SeaFreshness {
  if (killed || !Number.isFinite(runMs)) return 'dead';
  const age = nowMs - runMs;
  if (age > SEA_DEAD_MS || age < -3_600_000) return 'dead';
  return age > SEA_STALE_MS ? 'stale' : 'live';
}
/** Newest run behind the time gate. */
export const seaExpectedRun = (nowMs: number) => seaRunOf(nowMs - SEA_RUN_GATE_MS);

// --- Retention ---------------------------------------------------------------------------------

export const SEA_RETENTION = Object.freeze({
  /** Plan SW-2: only the current and the previous run per model. */
  runsKept: 2,
  /** Spot files follow the runs. */
  spotsKept: 2,
  /**
   * V-SW-15: wind refreshes (`spots/<run>-w<t1>.json`) follow their run, and ALL of a kept run stay (newest 8 at most), so the
   * 6-hourly archive sees every one: ≤ 4 per run in its 12 h as the newest run (t1 every 3 h), ≈ 70 KB each (live 08.10.:
   * 69 599 B) ⇒ ≈ 0.56 MB for two runs, worst case 16 × 70 KB ≈ 1.1 MB.
   */
  windPerRunKept: 8,
  /** Text issues: 48 h per product (the DWD window), at least 2. */
  textMaxAgeMs: 48 * 3_600_000, textMinKeep: 2,
  /** Quarantine: 7 days (diagnosis for Gate B), at least 2. */
  quarantineMaxAgeMs: 7 * 24 * 3_600_000, quarantineMinKeep: 2,
});

// --- PNG channel coding (E-SW-12) --------------------------------------------------------------

/** R: Hs in 5 cm steps; 0–253 = 0–12.65 m, 254 = ≥ 12.70 m (clipped, counted), 255 = no value. */
export const SEA_HS_STEP_M = 0.05;
export const SEA_HS_CLIP = 254;
export const SEA_NULL = 255;
/** G: direction the sea COMES FROM (meteorological), 256 steps of 1.40625°. */
export const SEA_DIR_STEPS = 256;
/** B: period in 0.1 s; 0–254 = 0–25.4 s, 255 = no value. */
export const SEA_PER_STEP_S = 0.1;
/** A: 255 = water (bitmap set), 0 = land. */
export const SEA_WATER = 255;

export function encodeHs(hs: number | null): number {
  if (hs == null || !Number.isFinite(hs)) return SEA_NULL;
  const q = Math.round(hs / SEA_HS_STEP_M);
  return q >= SEA_HS_CLIP ? SEA_HS_CLIP : Math.max(0, q);
}
export const decodeHs = (r: number): number | null => (r === SEA_NULL ? null : r * SEA_HS_STEP_M);
export function encodeDir(deg: number | null): number {
  if (deg == null || !Number.isFinite(deg)) return 0;
  return Math.round((((deg % 360) + 360) % 360) / 360 * SEA_DIR_STEPS) % SEA_DIR_STEPS;
}
export const decodeDir = (g: number): number => (g * 360) / SEA_DIR_STEPS;
export function encodePeriod(s: number | null): number {
  if (s == null || !Number.isFinite(s)) return SEA_NULL;
  return Math.min(254, Math.max(0, Math.round(s / SEA_PER_STEP_S)));
}
export const decodePeriod = (b: number): number | null => (b === SEA_NULL ? null : b * SEA_PER_STEP_S);

/** One decoded cell of an `f`/`c` image; `null` = water without a valid value, `undefined` would be land. */
export interface SeaCell { hs: number | null; dir: number | null; per: number | null }
export function decodeCell(rgba: ArrayLike<number>, o: number): SeaCell | undefined {
  if (rgba[o + 3] !== SEA_WATER) return undefined;
  const hs = decodeHs(rgba[o]);
  return { hs, dir: hs == null ? null : decodeDir(rgba[o + 1]), per: hs == null ? null : decodePeriod(rgba[o + 2]) };
}

// --- Value rules (plan SW-1, table "Wert") -----------------------------------------------------

export const SEA_LIMITS = Object.freeze({ hsM: [0, 20] as const, perS: [0, 30] as const, dirDeg: [0, 360] as const });
/** `tm10` exactly 1.0 s at Hs < 0.05 m is the model's placeholder for "no waves" (SW-0: 100 % of such points). */
export const SEA_PLACEHOLDER = Object.freeze({ perS: 1.0, belowHsM: 0.05, eps: 1e-6 });
/** `ppww` > 12 s at `shww` < 0.3 m is an artefact of shallow cells (SW-0: 496 points at +24 h). */
export const SEA_PPWW_ARTEFACT = Object.freeze({ aboveS: 12, belowHsM: 0.3 });
/** More than 0.1 % of a field out of range ⇒ the run goes to quarantine. */
export const SEA_MAX_INVALID_SHARE = 0.001;

export type SeaRuleId =
  | 'hsRange' | 'perRange' | 'dirRange' | 'placeholder' | 'ppwwArtefact' | 'hsClipped'
  | 'mask' | 'seaPoints' | 'incomplete' | 'invalidShare' | 'grid';

export interface SeaRule { id: SeaRuleId; level: 'value' | 'field' | 'run'; effect: string; quarantine: boolean }
export const SEA_RULES: Readonly<Record<SeaRuleId, SeaRule>> = Object.freeze({
  hsRange: { id: 'hsRange', level: 'value', effect: 'Hs außerhalb 0–20 m ⇒ null, gezählt', quarantine: false },
  perRange: { id: 'perRange', level: 'value', effect: 'Periode außerhalb 0–30 s ⇒ null, gezählt', quarantine: false },
  dirRange: { id: 'dirRange', level: 'value', effect: 'Richtung außerhalb 0–360° ⇒ Zelle null, gezählt', quarantine: false },
  placeholder: { id: 'placeholder', level: 'value', effect: 'Periode exakt 1,0 s bei Hs < 0,05 m ⇒ null (Platzhalter)', quarantine: false },
  ppwwArtefact: { id: 'ppwwArtefact', level: 'value', effect: 'ppww > 12 s bei shww < 0,3 m ⇒ null (Artefakt)', quarantine: false },
  hsClipped: { id: 'hsClipped', level: 'value', effect: 'Hs ≥ 12,70 m ⇒ Stufe 254 (gekappt), gezählt', quarantine: false },
  invalidShare: { id: 'invalidShare', level: 'field', effect: 'mehr als 0,1 % eines Feldes außerhalb ⇒ Quarantäne', quarantine: true },
  mask: { id: 'mask', level: 'field', effect: 'Hash der Landmaske weicht ab ⇒ Quarantäne', quarantine: true },
  seaPoints: { id: 'seaPoints', level: 'field', effect: 'Zahl der Seepunkte weicht vom Vertrag ab ⇒ Quarantäne', quarantine: true },
  grid: { id: 'grid', level: 'field', effect: 'Gitter weicht vom Vertrag ab ⇒ Quarantäne', quarantine: true },
  incomplete: { id: 'incomplete', level: 'run', effect: 'nicht 13 × Schritte im Inventar ⇒ nicht freigeben, letzter guter Lauf bleibt', quarantine: false },
});

export interface SeaCounts { cells: number; invalid: number; placeholder: number; ppwwArtefact: number; clipped: number }
export const newCounts = (): SeaCounts => ({ cells: 0, invalid: 0, placeholder: 0, ppwwArtefact: 0, clipped: 0 });

/** Rule on a height; `null` when out of range (counted). */
export function cleanHs(hs: number, c: SeaCounts): number | null {
  if (!Number.isFinite(hs) || hs < SEA_LIMITS.hsM[0] || hs > SEA_LIMITS.hsM[1]) { c.invalid++; return null; }
  if (Math.round(hs / SEA_HS_STEP_M) >= SEA_HS_CLIP) c.clipped++;
  return hs;
}
/**
 * Rule on a direction; `null` when out of range (counted). The GRIB packing (decimal scale 2) yields 360.000…360.001
 * for a north direction (run 2026100700: 73 such values in 21 direction fields) — within ±0.05° of the range it is
 * a valid direction and is folded to 0–360.
 */
export const SEA_DIR_PACK_TOL = 0.05;
export function cleanDir(d: number, c: SeaCounts): number | null {
  if (!Number.isFinite(d) || d < SEA_LIMITS.dirDeg[0] - SEA_DIR_PACK_TOL || d > SEA_LIMITS.dirDeg[1] + SEA_DIR_PACK_TOL) { c.invalid++; return null; }
  return ((d % 360) + 360) % 360;
}
/** Rule on a mean period, with its height for the placeholder rule. */
export function cleanPeriod(p: number, hs: number | null, c: SeaCounts): number | null {
  if (!Number.isFinite(p) || p < SEA_LIMITS.perS[0] || p > SEA_LIMITS.perS[1]) { c.invalid++; return null; }
  if (Math.abs(p - SEA_PLACEHOLDER.perS) < SEA_PLACEHOLDER.eps && (hs == null || hs < SEA_PLACEHOLDER.belowHsM)) { c.placeholder++; return null; }
  return p;
}
/** Rule on the wind-sea peak period (`ppww`), with the wind-sea height. */
export function cleanPeakWindSea(pp: number, shww: number | null, c: SeaCounts): number | null {
  const p = cleanPeriod(pp, shww, c);
  if (p != null && p > SEA_PPWW_ARTEFACT.aboveS && (shww == null || shww < SEA_PPWW_ARTEFACT.belowHsM)) { c.ppwwArtefact++; return null; }
  return p;
}

/** Field-level verdict: share of out-of-range values against the sea points. */
export const invalidShareOk = (c: SeaCounts) => c.cells === 0 || c.invalid / c.cells <= SEA_MAX_INVALID_SHARE;

// --- Run gate (plan SW-1, tables "Feld" and "Lauf") --------------------------------------------

export interface SeaRunCheck {
  model: SeaModel;
  run: string;
  /** Files of this run listed in the DWD inventory (all 13 parameters). */
  inventoryFiles: number;
  /** Grid of every decoded field (one per field read). */
  grids: SeaGrid[];
  /** Sea points of every decoded field. */
  seaPoints: number[];
  /** Mask hash of every decoded field. */
  maskHashes: string[];
  /** `static/mask-<model>.hash` of the line; `null` = first run (the hash is recorded, not compared). */
  expectedMaskHash: string | null;
  /** Rule counts per field. */
  counts: SeaCounts[];
}
export interface SeaRunVerdict { publish: boolean; quarantine: boolean; reasons: { rule: SeaRuleId; detail: string }[] }

const gridEq = (a: SeaGrid, b: SeaGrid) => a.ni === b.ni && a.nj === b.nj && Math.abs(a.lat1 - b.lat1) < 1e-4 && Math.abs(a.lon1 - b.lon1) < 1e-4
  && Math.abs(a.di - b.di) < 1e-5 && Math.abs(a.dj - b.dj) < 1e-5;

/**
 * Publish only a complete run (13 × steps in the inventory) whose every field has the contract's grid, sea points and
 * mask and at most 0.1 % out-of-range values. Incomplete = not yet (no quarantine, the last good run stays); a broken
 * field = quarantine (diagnosis file, the last good run stays).
 */
export function validateSeaRun(x: SeaRunCheck): SeaRunVerdict {
  const spec = SEA_MODELS[x.model];
  const reasons: SeaRunVerdict['reasons'] = [];
  const want = SEA_PARAMS.length * spec.steps.length;
  if (x.inventoryFiles !== want) reasons.push({ rule: 'incomplete', detail: `${x.inventoryFiles}/${want} Dateien im Inventar` });
  const badGrid = x.grids.filter((gr) => !gridEq(gr, spec.grid)).length;
  if (badGrid) reasons.push({ rule: 'grid', detail: `${badGrid} Felder mit fremdem Gitter` });
  const badSea = x.seaPoints.filter((n) => n !== spec.seaPoints);
  if (badSea.length) reasons.push({ rule: 'seaPoints', detail: `${badSea.length} Felder, z. B. ${badSea[0]} statt ${spec.seaPoints}` });
  const hashes = new Set(x.maskHashes);
  if (hashes.size > 1) reasons.push({ rule: 'mask', detail: `${hashes.size} verschiedene Masken im Lauf` });
  else if (x.expectedMaskHash && hashes.size === 1 && !hashes.has(x.expectedMaskHash)) reasons.push({ rule: 'mask', detail: `${[...hashes][0].slice(0, 12)} ≠ ${x.expectedMaskHash.slice(0, 12)}` });
  const badShare = x.counts.filter((c) => !invalidShareOk(c));
  if (badShare.length) reasons.push({ rule: 'invalidShare', detail: `${badShare.length} Felder > 0,1 % außerhalb, z. B. ${badShare[0].invalid}/${badShare[0].cells}` });
  const quarantine = reasons.some((r) => SEA_RULES[r.rule].quarantine);
  return { publish: reasons.length === 0, quarantine, reasons };
}

// --- Mask ----------------------------------------------------------------------------------------

/**
 * Packed land/sea bitmap (1 bit per cell, row-major from the north-west corner, MSB first) — the input of the
 * mask hash (`static/mask-<model>.hash` = sha256 hex of these bytes). Pure, so client verifiers can hash too.
 */
export function packMask(values: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(values.length / 8));
  for (let k = 0; k < values.length; k++) if (!Number.isNaN(values[k] as number)) out[k >> 3] |= 0x80 >> (k & 7);
  return out;
}

// --- Spot series (spots/<run>.json) --------------------------------------------------------------

/**
 * Integer columns of a spot series, one value per hour 0–78 of the wave run (`null` = no value). Units:
 * hs/ws/sw cm · dir/wsDir/swDir/windDir deg (comes from) · tm/wsPer/swPer/wsPeak/swPeak 0.1 s · wind/gust 0.1 m/s.
 */
export const SEA_SPOT_VARS = Object.freeze([
  'hs', 'dir', 'tm', 'ws', 'wsDir', 'wsPer', 'wsPeak', 'sw', 'swDir', 'swPer', 'swPeak', 'wind', 'gust', 'windDir',
] as const);
export type SeaSpotVar = typeof SEA_SPOT_VARS[number];
/** Provenance per column — shown at every number (plan: model / Fusion / measured / official). */
export const SEA_SPOT_ORIGIN: Readonly<Record<SeaSpotVar, 'model' | 'fusion'>> = Object.freeze({
  hs: 'model', dir: 'model', tm: 'model', ws: 'model', wsDir: 'model', wsPer: 'model', wsPeak: 'model',
  sw: 'model', swDir: 'model', swPer: 'model', swPeak: 'model', wind: 'fusion', gust: 'fusion', windDir: 'fusion',
});
const SCALE: Readonly<Record<SeaSpotVar, number>> = Object.freeze({
  hs: 100, dir: 1, tm: 10, ws: 100, wsDir: 1, wsPer: 10, wsPeak: 10, sw: 100, swDir: 1, swPer: 10, swPeak: 10, wind: 10, gust: 10, windDir: 1,
});
export function encodeSpotValue(v: SeaSpotVar, x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const q = Math.round(x * SCALE[v]);
  return v === 'dir' || v === 'wsDir' || v === 'swDir' || v === 'windDir' ? ((q % 360) + 360) % 360 : q;
}
export const decodeSpotValue = (v: SeaSpotVar, q: number | null | undefined): number | null => (q == null ? null : q / SCALE[v]);

/**
 * buscosun Fusion can return a gust below the mean wind at single hours (run 2026100700: Fehmarn Südstrand +42 h,
 * 13.1 < 13.8 m/s). Such a gust is not shown: it becomes `null` at that hour (counted per spot), the wind stays.
 * Tolerance 0.5 m/s (`SEA_GUST_BELOW_WIND`).
 */
export const SEA_GUST_BELOW_WIND = 5;   // in 0.1 m/s
export function sanitizeGust(series: { wind: (number | null)[]; gust: (number | null)[] }): number {
  let n = 0;
  series.gust.forEach((g, i) => { const w = series.wind[i]; if (g != null && w != null && g + SEA_GUST_BELOW_WIND < w) { series.gust[i] = null; n++; } });
  return n;
}

/** The three columns a wind refresh (V-SW-2) replaces. */
export const SEA_WIND_VARS = Object.freeze(['wind', 'gust', 'windDir'] as const);
export type SeaWindVar = typeof SEA_WIND_VARS[number];

/**
 * V-SW-2: a spot series with the wind of a later computation — from hour `from` on all three wind columns come from the
 * refresh (also its nulls: a dropped gust stays dropped), before it the run's own wind stays (those hours are past for
 * the refresh, the cube starts at its computation hour). Pure; works on encoded and on decoded columns alike.
 */
export function mergeSpotWind<T>(base: Record<SeaWindVar, (T | null)[]>, upd: Record<SeaWindVar, (T | null)[]>, from: number): Record<SeaWindVar, (T | null)[]> {
  const out = {} as Record<SeaWindVar, (T | null)[]>;
  for (const v of SEA_WIND_VARS) out[v] = base[v].map((x, i) => (i >= from ? (upd[v][i] ?? null) : x));
  return out;
}

/** Value lock of a series (the client re-checks before display): ranges as the value rules, wind 0–80 m/s. */
export function spotSeriesProblems(series: Partial<Record<SeaSpotVar, (number | null)[]>>, hours = SEA_SPOT_STEPS.length): string[] {
  const out: string[] = [];
  const lim: Record<SeaSpotVar, [number, number]> = {
    hs: [0, 2000], ws: [0, 2000], sw: [0, 2000], dir: [0, 359], wsDir: [0, 359], swDir: [0, 359], windDir: [0, 359],
    tm: [0, 300], wsPer: [0, 300], wsPeak: [0, 300], swPer: [0, 300], swPeak: [0, 300], wind: [0, 800], gust: [0, 800],
  };
  for (const v of SEA_SPOT_VARS) {
    const a = series[v];
    if (!Array.isArray(a) || a.length !== hours) { out.push(`${v}: Länge ${Array.isArray(a) ? a.length : '–'} statt ${hours}`); continue; }
    a.forEach((x, i) => { if (x != null && (!Number.isInteger(x) || x < lim[v][0] || x > lim[v][1])) out.push(`${v}[${i}] = ${x}`); });
  }
  const g = series.gust, w = series.wind;
  if (g && w) g.forEach((x, i) => { if (x != null && w[i] != null && x + SEA_GUST_BELOW_WIND < (w[i] as number)) out.push(`gust[${i}] ${x} < wind ${w[i]}`); });
  return out;
}

// --- Spot catalogue (static/spots.json, E-SW-5) --------------------------------------------------

export type SeaSpotKind = 'strand' | 'kite' | 'hafen' | 'revier';
export type SeaRegion = 'nordsee' | 'ostsee';
export interface SeaSpot {
  /** URL slug, `/seewetter/<id>`. */
  id: string;
  name: string;
  region: SeaRegion;
  kinds: SeaSpotKind[];
  /** Hand-set position of the spot (beach/harbour), WGS84. */
  lat: number; lon: number;
  /** Shore normal (direction pointing SEAWARD, degrees), computed from the CWAM mask (`normalFrom: 'mask'`). */
  normal: number;
  normalFrom: 'mask' | 'set';
  /** With `normalFrom: 'set'`: the value computed from the mask, and why the hand value wins. */
  normalMask?: number;
  normalWhy?: string;
  /** CWAM water cell the series is read from (row from north, column from west) and its distance to the spot. */
  cell: { model: SeaModel; i: number; j: number; km: number };
  /** FQDL50 sea area (DWD WARNCELLID 4…), FQDL51 coast section (5…), WODL45 coast block. */
  seaArea: { id: string; name: string } | null;
  coast: { id: string; name: string } | null;
  wodlCoast: 'Nordseekueste' | 'Ostseekueste';
  /** Nearest DWD POI station delivering wind and gust (SW-0 §2.6), with distance. */
  station: { id: string; name: string; km: number; lat: number; lon: number } | null;
  /** Wadden-sea spot: the model computes with the tide, the water level itself is not shown (hint at the value). */
  tidal?: boolean;
}

export function spotCatalogProblems(spots: SeaSpot[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const g = SEA_MODELS.cwam.grid;
  for (const s of spots) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.id)) out.push(`${s.id}: Kennung kein Slug`);
    if (ids.has(s.id)) out.push(`${s.id}: doppelt`);
    ids.add(s.id);
    if (!(s.lat > g.lat2 && s.lat < g.lat1 && s.lon > g.lon1 && s.lon < g.lon2)) out.push(`${s.id}: außerhalb CWAM`);
    if (!(s.normal >= 0 && s.normal < 360)) out.push(`${s.id}: Ufernormale ${s.normal}`);
    if (!(s.cell.i >= 0 && s.cell.i < g.ni && s.cell.j >= 0 && s.cell.j < g.nj)) out.push(`${s.id}: Zelle außerhalb`);
    if (!(s.cell.km >= 0 && s.cell.km <= SEA_SPOT_MAX_CELL_KM)) out.push(`${s.id}: Zelle ${s.cell.km} km entfernt`);
  }
  return out;
}
/** A spot farther than this from its water cell is not a spot of this line (catalogue rule). */
export const SEA_SPOT_MAX_CELL_KM = 3;

/** Centre of CWAM cell (i, j). */
export function seaCellCentre(model: SeaModel, i: number, j: number): { lat: number; lon: number } {
  const g = SEA_MODELS[model].grid;
  return { lat: g.lat1 - j * g.dj, lon: g.lon1 + i * g.di };
}
/** Cell (fractional) of a position; rows from north. */
export function seaCellOf(model: SeaModel, lat: number, lon: number): { i: number; j: number } {
  const g = SEA_MODELS[model].grid;
  return { i: (lon - g.lon1) / g.di, j: (g.lat1 - lat) / g.dj };
}

// --- Kill switch and visibility ------------------------------------------------------------------

/**
 * Two kill switches (D-31 pattern): producer side `SEA_KILL=1` writes `status.killSwitch: true` (the client then
 * shows "Keine Daten", no surfaces); client side `?sea=0`. `?sea=1` is the phase flag (default OFF until Gate C).
 */
export { seaFlagFrom, SEA_LIVE } from './seaFlag';
