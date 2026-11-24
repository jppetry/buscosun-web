/**
 * Phase GM (GM-3c, audit/gletscher-schneemodell.md §3f) — contract of the snowpack line: one document per run (`snowpack/<run>.json`, run = `yyyymmddhh`
 * UTC of the run hour) and the carried state (`snowpack/state.json`). DOM-free and import-light: the producer (`scripts/glacier/melt.mjs`, core
 * `scripts/glacier/lib/snowpackcore.mjs`), the seed tool, the verifiers and — from GM-7 on — the page share it. No page reads the product yet (shadow).
 *
 * Honesty rules encoded here:
 *  - every value is COMPUTED (`origin: 'computed'`), never measured; the document says that it has not been checked against measurements on the ice
 *    (`verified.measured: false`) and carries the verdict of the calibration its precipitation factor comes from;
 *  - the values are expected values without a spread (`rules.spread: 'none'`); new snow is the SETTLED thickness of what fell in the window;
 *  - GM-5a (producer switch `--snowpack-spread=scenarios`, off by default): next to the unchanged expected values a row on own answers carries the
 *    p10 / p90 of K scenarios per elevation and day and the spread of the SUM of the days 8–14 (a spread of a sum is the quantile of the scenario
 *    sums, never a sum of daily quantiles); a row on a neighbour's answers says that it has none; the run hour itself carries no spread per row —
 *    the head names ONE pair, the uncertainty of the precipitation factor, as not checked on the ice;
 *  - the document names since when the calculation runs, where its state came from and how many hours it ran without forcing — per glacier where that differs;
 *  - one snowpack from one calculation: the state names the precipitation rule and the density source it was computed with (V-GM-27).
 */
export const GLACIER_SNOWPACK_DIR = 'snowpack';
export const GLACIER_SNOWPACK_RUN_RE = /^\d{10}$/;
export const glacierSnowpackRunPath = (run: string) => `${GLACIER_SNOWPACK_DIR}/${run}.json`;
export const GLACIER_SNOWPACK_STATE_PATH = `${GLACIER_SNOWPACK_DIR}/state.json`;
/** Days of the forecast part (the days of "Wetter am Gletscher"), counted from the run hour. */
export const GLACIER_SNOWPACK_DAYS = 14;
/** Windows of the new snow at the run hour (hours): what a snow board cleared 24 / 48 / 72 h ago would show. */
export const GLACIER_SNOWPACK_WINDOWS = Object.freeze([24, 48, 72] as const);
/** Hours of forcing a state carries for the next run (`set`: the longest gap between two melt runs measured 12.10.–23.11.2026 was 15 h). */
export const GLACIER_SNOWPACK_PEND_H = 18;
/** The three elevations of a row, in this order. */
export const GLACIER_SNOWPACK_HEIGHTS = Object.freeze(['tongue', 'median', 'top'] as const);
export const GLACIER_SNOWPACK_NOTE = 'berechnet, noch nicht nachgemessen';
/** Where the state of a run came from: carried from the previous run, the seed of the spin-up (first run after it), or a named cold start. */
export const GLACIER_SNOWPACK_STATE_SOURCES = Object.freeze(['carried', 'seed', 'cold'] as const);
/** Bounds of a bulk density a row may imply (kg m⁻³): below the lower one a depth has no mass behind it, above the upper one the core never goes. */
export const GLACIER_SNOWPACK_DENSITY_BOUNDS = Object.freeze([20, 420] as const);
/**
 * GM-5a — the spread rule of a run with `--snowpack-spread=scenarios` (`rules.spread`; without the switch the word `'none'` stands there).
 * `k` scenarios per glacier on own answers, each ONE path of the hourly precipitation (quantile of the answer's distribution) and ONE path of the
 * temperature error, hourly correlation `rho`, independent of each other (both `set`, the rule of the weather part); fixed per scenario the
 * precipitation factor and the systematic part of the new-snow density, drawn anew per forecast day the event part of the density (log-normal,
 * the sigmas `measured`: GM-3 N1-a, 43 glaciers, and the snow boards of GM-3 B, audit §3i). `week2` = the days whose new snow is summed per scenario.
 */
export const GLACIER_SNOWPACK_SPREAD_K = 100;
export const GLACIER_SNOWPACK_SPREAD_RHO = 0.9;
export const GLACIER_SNOWPACK_SPREAD_WEEK2 = Object.freeze([8, 14] as const);
export const GLACIER_SNOWPACK_SPREAD_SIGMA = Object.freeze({ factor: 0.25, densitySystematic: 0.12, densityEvent: 0.3 });
export const GLACIER_SNOWPACK_SPREAD_RULE = Object.freeze({
  rule: 'scenarios', k: GLACIER_SNOWPACK_SPREAD_K, rho: GLACIER_SNOWPACK_SPREAD_RHO, quantiles: Object.freeze([10, 90]), sums: 'scenarios',
  week2: GLACIER_SNOWPACK_SPREAD_WEEK2, sigma: GLACIER_SNOWPACK_SPREAD_SIGMA, origin: Object.freeze({ paths: 'set', sigma: 'measured' }), neighbour: 'none',
});
/** Why a row carries no spread: it runs on a neighbour's answers (E-GM-35), or its own answer names no precipitation distribution. */
export const GLACIER_SNOWPACK_SPREAD_NONE = Object.freeze(['neighbour', 'no-distribution'] as const);
/** E-GM-33 — the one pair the head of a run with spreads names for the run hour: p10 / p90 of the factor of a glacier against its country's (GM-3 N1-a). */
export const GLACIER_SNOWPACK_NOW_FACTOR = Object.freeze({ p10: 0.73, p90: 1.37, origin: 'measured', verified: false, note: 'Unsicherheit des Niederschlagsfaktors je Gletscher, auf dem Eis nicht nachgemessen' });
/** Tolerance of the rounding to 0.1 (cm, mm) in the cross-field rules. */
const EPS = 0.15;

/** [tongue, median, top]. */
export type Levels<T> = [T, T, T];

export interface GlacierSnowpackRow {
  id: string;
  /** Elevations of the three values (m): mid of the lowest band, median elevation, mid of the highest band — the ones of the weather row. */
  z: Levels<number>;
  /** Forcing: own answers of buscosun Fusion (`own`) or the id of the neighbour whose answers were placed on these elevations. */
  f: 'own' | string;
  /** Only when the row did NOT run on three answers: temperature of one answer moved by the lapse, solid share by the temperature ramp. */
  lv?: 'lapse';
  /** Snow depth at the run hour (cm) and snow water equivalent (mm). */
  hs: Levels<number>;
  swe: Levels<number>;
  /** New snow of the last 24 / 48 / 72 h at the run hour (cm, settled), per elevation. */
  hn: Levels<[number, number, number]>;
  /** Forecast, per elevation and day from the run hour: snow depth at the end of the day (cm) and the new snow of the day (cm, settled at its end). */
  hsd: Levels<number[]>;
  hnd: Levels<number[]>;
  /** Hours since the begin of this glacier's calculation that ran without forcing (absent = none). */
  gap?: number;
  /** Day (UTC) this glacier's calculation began, when later than `state.since` of the document. */
  from?: string;
  /** GM-5a, only in a run with spreads and on own answers: per elevation [p10 per day, p90 per day] of the snow depth at the end of the day (cm). */
  hsq?: Levels<[number[], number[]]>;
  /** … and of the new snow of the day (cm, settled). */
  hnq?: Levels<[number[], number[]]>;
  /** … and per elevation [p10, median, p90] of the scenario SUMS of the new snow of the days `week2` (cm). */
  hnw?: Levels<[number, number, number]>;
  /** GM-5a, only in a run with spreads: why this row carries none (`GLACIER_SNOWPACK_SPREAD_NONE`). */
  sq?: 'neighbour' | 'no-distribution';
}

export interface GlacierSnowpackSpreadRule {
  rule: 'scenarios'; k: number; rho: number; quantiles: readonly number[]; sums: 'scenarios'; week2: readonly number[];
  sigma: { factor: number; densitySystematic: number; densityEvent: number }; origin: { paths: string; sigma: string }; neighbour: 'none';
}

export interface GlacierSnowpackDoc {
  schema: 1;
  kind: 'glacier/snowpack';
  run: string;
  runAt: string;
  origin: 'computed';
  engine: { name: string; version: number | null; stageCurrent: boolean };
  cube: { t1: string | null; t2: string | null; t3: string | null; stations: string | null };
  verified: { measured: false; note: string };
  heights: readonly string[];
  days: number;
  windows: readonly number[];
  rules: {
    forcing: { rule: 'answers'; neighbour: 'placed'; phase: string; order: 'not-more-below' };
    /** The precipitation factor of the run: the block of the melt document (`country`) or the factor of Gate C with its set gradient. */
    precip: { rule: 'country' | 'gate-c'; gate?: boolean; reason?: string; [k: string]: unknown };
    density: { source: 'board' | 'helfricht'; rhoNew: number; p10: number; p90: number; origin: 'measured' | 'literature' };
    melt: { rule: 'eti'; TF: number; SRF: number; origin: string; radiation: 'clear-sky-cloud' };
    core: { layerH: number; newWindowH: number; sources: string[] };
    sums: 'expected';
    spread: 'none' | GlacierSnowpackSpreadRule;
    newSnow: 'settled';
  };
  /** GM-5a, only in a run with spreads: rows with a spread and the rows without, by reason. */
  spread?: { rows: number; none: Record<string, number> };
  /** GM-5a, only in a run with spreads: what is said about the run hour instead of a spread per row (E-GM-33). */
  now?: { factor: { p10: number; p90: number; origin: string; verified: false; note: string } };
  state: {
    source: 'carried' | 'seed' | 'cold';
    /** Begin of the calculation chain (ISO, UTC). */
    since: string;
    /** Hours between the state taken over and the run hour, and how many of them were computed from the forcing the state carried. */
    ageH: number | null;
    replayedH: number | null;
    /** Glaciers that began in this run (no entry in the state taken over). */
    started: number;
    /** Glaciers with hours without forcing, and the largest such number. */
    gaps: { glaciers: number; maxH: number };
  };
  coverage: { own: number; neighbour: number; lapse: number };
  build: string;
  glaciers: GlacierSnowpackRow[];
  skipped: { id: string; reason: string }[];
}

/** Entry of one glacier in the state: [begin (hours since epoch), hours without forcing, pack rows ×3, snow albedo ×1000 ×3, pending forcing or null]. */
export type GlacierSnowpackStateEntry = [number, number, Levels<number[]>, Levels<number>, GlacierSnowpackPending | null];
/** Forcing of the hours after `atMs`: temperature ×10 (°C) and solid precipitation ×100 (mm) per elevation, radiation (W m⁻²) — integers, hour by hour. */
export type GlacierSnowpackPending = [Levels<number[]>, Levels<number[]>, number[]];

export interface GlacierSnowpackState {
  schema: 1;
  kind: 'glacier/snowpack-state';
  /** Time the packs belong to (ms UTC, a full hour): the run hour of the run that wrote the state, or the end of the spin-up. */
  atMs: number;
  /** `run` = written by a run of the producer, `seed` = written by the spin-up tool. */
  source: 'run' | 'seed';
  run: string | null;
  /** Begin of the calculation chain (ISO, UTC). */
  since: string;
  /** The rules the mass and the thickness of every pack were computed with; a run with other switches does not continue this state. */
  rules: { precip: 'country' | 'gate-c'; density: 'board' | 'helfricht' };
  pendH: number;
  /** Only in a seed: what it was built from (free form, written by the seed tool). */
  seed?: Record<string, unknown>;
  g: Record<string, GlacierSnowpackStateEntry>;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const lv3 = (a: unknown, ok: (v: unknown) => boolean): boolean => Array.isArray(a) && a.length === 3 && a.every(ok);
const nonNeg = (v: unknown) => num(v) && v >= 0;

/** Rules of a run document. `catalogIds` = the ids of the catalogue of the run. Empty = valid. */
export function snowpackProblems(doc: GlacierSnowpackDoc, catalogIds?: ReadonlySet<string>): string[] {
  if (doc?.kind !== 'glacier/snowpack' || doc.schema !== 1) return ['kind/schema'];
  const p: string[] = [];
  if (!GLACIER_SNOWPACK_RUN_RE.test(doc.run)) p.push(`Lauf ${doc.run}`);
  if (doc.origin !== 'computed') p.push(`Herkunft ${doc.origin} (nur „computed“)`);
  if (doc.verified?.measured !== false || !doc.verified.note) p.push('Vermerk „nicht nachgemessen“ fehlt');
  if (!Number.isInteger(doc.engine?.version)) p.push('Stand von buscosun Fusion fehlt');
  if (doc.days !== GLACIER_SNOWPACK_DAYS) p.push(`Tage ${doc.days}`);
  if (JSON.stringify(doc.windows) !== JSON.stringify(GLACIER_SNOWPACK_WINDOWS)) p.push('Fenster des Neuschnees');
  if (JSON.stringify(doc.heights) !== JSON.stringify(GLACIER_SNOWPACK_HEIGHTS)) p.push('Höhen');
  const r = doc.rules;
  const sr = r?.spread, spreadOn = sr != null && sr !== 'none';
  if (r?.sums !== 'expected' || r.newSnow !== 'settled' || sr == null) p.push('Regeln: Erwartungswert ohne Spanne, gesetzter Neuschnee');
  if (spreadOn) {
    const sg = (sr as GlacierSnowpackSpreadRule).sigma, w2 = (sr as GlacierSnowpackSpreadRule).week2;
    if (typeof sr !== 'object' || sr.rule !== 'scenarios' || !Number.isInteger(sr.k) || sr.k < 10 || !(sr.rho > 0 && sr.rho < 1) || JSON.stringify(sr.quantiles) !== '[10,90]' || sr.sums !== 'scenarios' || sr.neighbour !== 'none'
      || !sg || !nonNeg(sg.factor) || !nonNeg(sg.densitySystematic) || !nonNeg(sg.densityEvent) || !sr.origin?.paths || !sr.origin?.sigma
      || !Array.isArray(w2) || w2.length !== 2 || !Number.isInteger(w2[0]) || !Number.isInteger(w2[1]) || w2[0] < 1 || w2[0] > w2[1] || w2[1] > GLACIER_SNOWPACK_DAYS) p.push('Regeln: Spanne');
    const nf = doc.now?.factor;
    if (!nf || !(nf.p10 > 0 && nf.p10 < 1 && nf.p90 > 1) || nf.verified !== false || !nf.note || !nf.origin) p.push('Kopf: Unsicherheit des Faktors zur Laufstunde fehlt');
  } else if (doc.now != null || doc.spread != null) p.push('Kopf: Spanne ohne Regel');
  if (!['country', 'gate-c'].includes(r?.precip?.rule as string)) p.push('Regeln: Niederschlagsfaktor fehlt');
  else if (r.precip.rule === 'country' && (typeof r.precip.gate !== 'boolean' || (r.precip.gate === false && !r.precip.reason))) p.push('Regeln: Urteil der Eichung fehlt');
  const d = r?.density;
  if (!d || !['board', 'helfricht'].includes(d.source) || !(d.p10 < d.rhoNew && d.rhoNew < d.p90) || !['measured', 'literature'].includes(d.origin)) p.push('Regeln: Neuschneedichte');
  else if (d.source === 'board' && r.precip?.rule !== 'country') p.push('Regeln: Dichte „board“ ohne den Niederschlagsfaktor „country“ (E-GM-13)');
  if (r?.melt?.rule !== 'eti' || !nonNeg(r.melt.TF) || !nonNeg(r.melt.SRF)) p.push('Regeln: Schmelze');
  if (r?.forcing?.rule !== 'answers' || !r.forcing.phase || r.forcing.order !== 'not-more-below') p.push('Regeln: Antrieb');
  const s = doc.state;
  if (!s || !(GLACIER_SNOWPACK_STATE_SOURCES as readonly string[]).includes(s.source) || Number.isNaN(Date.parse(s.since ?? ''))) p.push('Zustand: Quelle oder Beginn fehlt');
  else {
    if (Date.parse(s.since) > Date.parse(doc.runAt)) p.push('Zustand: Beginn nach dem Lauf');
    if (s.source === 'cold' ? s.ageH != null : !(nonNeg(s.ageH) && nonNeg(s.replayedH) && (s.replayedH as number) <= (s.ageH as number))) p.push('Zustand: Alter');
    if (!nonNeg(s.started) || !nonNeg(s.gaps?.glaciers) || !nonNeg(s.gaps?.maxH)) p.push('Zustand: Zähler');
  }
  const seen = new Set<string>();
  let own = 0, nb = 0, lapse = 0, gapped = 0, gapMax = 0, spreadRows = 0;
  const spreadNone: Record<string, number> = {};
  for (const g of doc.glaciers ?? []) {
    const bad = (what: string) => p.push(`${g.id}: ${what}`);
    if (seen.has(g.id)) bad('doppelt');
    seen.add(g.id);
    if (catalogIds && !catalogIds.has(g.id)) bad('nicht im Katalog');
    if (!lv3(g.z, num) || !(g.z[0] <= g.z[1] + 25 && g.z[1] <= g.z[2] + 25)) bad('Höhen');
    if (typeof g.f !== 'string' || !g.f || g.f === g.id || (g.f !== 'own' && catalogIds && !catalogIds.has(g.f))) bad('Antrieb');
    if (g.lv != null && g.lv !== 'lapse') bad(`lv ${g.lv}`);
    if (g.f === 'own') own++; else nb++;
    if (g.lv === 'lapse') lapse++;
    if (!lv3(g.hs, nonNeg) || !lv3(g.swe, nonNeg)) { bad('Schneehöhe/Wasserwert'); continue; }
    if (!lv3(g.hn, (a) => Array.isArray(a) && a.length === GLACIER_SNOWPACK_WINDOWS.length && a.every(nonNeg))) { bad('Neuschnee-Fenster'); continue; }
    if (!lv3(g.hsd, (a) => Array.isArray(a) && a.length === GLACIER_SNOWPACK_DAYS && a.every(nonNeg)) || !lv3(g.hnd, (a) => Array.isArray(a) && a.length === GLACIER_SNOWPACK_DAYS && a.every(nonNeg))) { bad('Tageswerte'); continue; }
    for (let l = 0; l < 3; l++) {
      const hs = g.hs[l], swe = g.swe[l], hn = g.hn[l];
      if ((hs > 0) !== (swe > 0)) bad(`Höhe ${l}: Schneehöhe ohne Wasserwert oder umgekehrt`);
      if (hs >= 1 && swe >= 1) { const rho = swe / (hs / 100); if (rho < GLACIER_SNOWPACK_DENSITY_BOUNDS[0] || rho > GLACIER_SNOWPACK_DENSITY_BOUNDS[1]) bad(`Höhe ${l}: Dichte ${rho.toFixed(0)}`); }
      if (hn[0] > hn[1] + EPS || hn[1] > hn[2] + EPS) bad(`Höhe ${l}: Neuschnee 24 h > 48 h > 72 h`);
      if (hn[2] > hs + EPS) bad(`Höhe ${l}: Neuschnee über der Schneehöhe`);
      for (let k = 0; k < GLACIER_SNOWPACK_DAYS; k++) if (g.hnd[l][k] > g.hsd[l][k] + EPS) { bad(`Höhe ${l}, Tag ${k}: Neuschnee über der Schneehöhe`); break; }
    }
    if (g.gap != null) { if (!(Number.isInteger(g.gap) && g.gap > 0)) bad('Stunden ohne Antrieb'); else { gapped++; gapMax = Math.max(gapMax, g.gap); } }
    if (g.from != null && (!/^\d{4}-\d{2}-\d{2}$/.test(g.from) || (s && g.from < String(s.since).slice(0, 10)))) bad('Beginn');
    // GM-5a: a spread only under a spread rule; then every row either carries all three fields or names why it has none
    const hasQ = g.hsq != null || g.hnq != null || g.hnw != null;
    if (!spreadOn) { if (hasQ || g.sq != null) bad('Spanne ohne Regel'); }
    else if (g.sq != null) {
      if (!(GLACIER_SNOWPACK_SPREAD_NONE as readonly string[]).includes(g.sq) || hasQ) bad('Spanne: Vermerk');
      else if ((g.sq === 'neighbour') !== (g.f !== 'own')) bad('Spanne: Vermerk passt nicht zum Antrieb');
      else spreadNone[g.sq] = (spreadNone[g.sq] ?? 0) + 1;
    } else {
      const q2 = (a: unknown) => lv3(a, (x) => Array.isArray(x) && x.length === 2 && x.every((y) => Array.isArray(y) && y.length === GLACIER_SNOWPACK_DAYS && y.every(nonNeg)));
      if (g.f !== 'own') bad('Spanne fehlt der Vermerk „neighbour“ (Nachbar-Zeile)');
      else if (!q2(g.hsq) || !q2(g.hnq) || !lv3(g.hnw, (x) => Array.isArray(x) && x.length === 3 && x.every(nonNeg))) bad('Spanne: Felder');
      else {
        spreadRows++;
        for (let l = 0; l < 3; l++) {
          const [s10, s90] = g.hsq![l], [n10, n90] = g.hnq![l], w = g.hnw![l];
          let ok = w[0] <= w[1] + EPS && w[1] <= w[2] + EPS;
          for (let k = 0; ok && k < GLACIER_SNOWPACK_DAYS; k++) ok = s10[k] <= s90[k] + EPS && n10[k] <= n90[k] + EPS && n10[k] <= s10[k] + EPS && n90[k] <= s90[k] + EPS;
          if (!ok) { bad(`Höhe ${l}: Spanne nicht geordnet`); break; }
        }
      }
    }
  }
  for (const k of doc.skipped ?? []) if (!k.reason) p.push(`${k.id}: übersprungen ohne Grund`);
  const c = doc.coverage;
  if (!c || c.own !== own || c.neighbour !== nb || c.lapse !== lapse) p.push('Abdeckung stimmt nicht mit den Zeilen');
  if (s?.gaps && (s.gaps.glaciers !== gapped || s.gaps.maxH !== gapMax)) p.push('Zustand: Stunden ohne Antrieb stimmen nicht mit den Zeilen');
  if (spreadOn) {
    const ds = doc.spread, keys = Object.keys(spreadNone).sort();
    if (!ds || ds.rows !== spreadRows || JSON.stringify(Object.keys(ds.none ?? {}).sort()) !== JSON.stringify(keys) || keys.some((k) => ds.none[k] !== spreadNone[k])) p.push('Kopf: Zählung der Spannen stimmt nicht mit den Zeilen');
  }
  return p;
}

/** Rules of a pack row of the state (`packToRow` of the snow core): [old swe ×10, old h ×10, then per fresh layer swe ×10, h ×10, start hour], integers. */
function packRowProblems(r: unknown): string | null {
  if (!Array.isArray(r) || r.length < 2 || (r.length - 2) % 3 !== 0 || r.some((v) => !Number.isInteger(v) || v < 0)) return 'unlesbar';
  for (let i = 0; i < r.length; i += i === 0 ? 2 : 3) {
    const swe = r[i], h = r[i + 1];
    if ((swe > 0) !== (h > 0)) return 'Masse ohne Dicke oder umgekehrt';
    if (swe > 0) { const rho = (100 * swe) / h; if (rho < GLACIER_SNOWPACK_DENSITY_BOUNDS[0] - 1e-9 || rho > GLACIER_SNOWPACK_DENSITY_BOUNDS[1] + 1e-9) return `Dichte ${rho.toFixed(0)}`; }
    if (i > 2 && r[i + 2] <= r[i - 1]) return 'Reihenfolge der Schichten';
  }
  return null;
}

/** Rules of a state. Empty = valid. */
export function snowpackStateProblems(s: GlacierSnowpackState): string[] {
  if (s?.kind !== 'glacier/snowpack-state' || s.schema !== 1) return ['kind/schema'];
  const p: string[] = [];
  if (!Number.isInteger(s.atMs) || s.atMs % 3_600_000 !== 0) p.push('Zeit');
  if (!['run', 'seed'].includes(s.source)) p.push('Quelle');
  if (Number.isNaN(Date.parse(s.since ?? '')) || Date.parse(s.since) > s.atMs) p.push('Beginn');
  if (!['country', 'gate-c'].includes(s.rules?.precip) || !['board', 'helfricht'].includes(s.rules?.density) || (s.rules.density === 'board' && s.rules.precip !== 'country')) p.push('Regeln');
  if (!Number.isInteger(s.pendH) || s.pendH < 0) p.push('pendH');
  const atH = s.atMs / 3_600_000, sinceH = Date.parse(s.since ?? '') / 3_600_000;
  for (const [id, e] of Object.entries(s.g ?? {})) {
    if (!Array.isArray(e) || e.length !== 5) { p.push(`${id}: Eintrag`); continue; }
    const [begin, holes, packs, alb, pend] = e;
    if (!Number.isInteger(begin) || begin > atH || begin < Math.floor(sinceH)) p.push(`${id}: Beginn`);
    if (!Number.isInteger(holes) || holes < 0 || holes > atH - begin) p.push(`${id}: Stunden ohne Antrieb`);
    if (!Array.isArray(packs) || packs.length !== 3) p.push(`${id}: Schneedecken`);
    else packs.forEach((r, l) => { const why = packRowProblems(r); if (why) p.push(`${id}: Schneedecke ${l} ${why}`); });
    if (!lv3(alb, (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000)) p.push(`${id}: Albedo`);
    if (pend != null) {
      const ok = Array.isArray(pend) && pend.length === 3 && lv3(pend[0], (a) => Array.isArray(a) && a.every(Number.isInteger)) && lv3(pend[1], (a) => Array.isArray(a) && a.every((v) => Number.isInteger(v) && (v as number) >= 0))
        && Array.isArray(pend[2]) && pend[2].every((v) => Number.isInteger(v) && v >= 0);
      const n = ok ? pend[2].length : -1;
      if (!ok || n > s.pendH || pend[0].some((a) => a.length !== n) || pend[1].some((a) => a.length !== n)) p.push(`${id}: gespeicherter Antrieb`);
    }
  }
  return p;
}
