/**
 * calibFit.ts — der Fit der Kalibrierung von buscosun Fusion (AP10), entworfen VOR den Daten (Phase FI, AP13;
 * `audit/fusion-vollform.md` §2.5).
 *
 * ── Was hier steht ──────────────────────────────────────────────────────────
 *   • der VERTRAG mit dem Nachlauf (AP9): Fallsätze je Parameterfamilie (`FitCase`) — was der Nachlauf aus dem
 *     Archiv je Punkt, Slot und Stunde liefern muss;
 *   • die REGISTRY: je Parameter Schätzer, Mindestbeleg (`CALIB_N_MIN` aus `calibDoc.ts` — eine Stelle für Fit
 *     und Leser), Schichtung, Voraussetzung;
 *   • die SCHÄTZER (rein, deterministisch, feste Saat) und die Ausgabe als Schema-2-Einträge (`measured` mit n,
 *     Tagen, Zeitraum, Schätzer, 90-%-Intervall), die `validateCalibDocument` annimmt;
 *   • der harte Abbruch „Archiv zu kurz" mit Diagnose: n und Tage je Parameter, was fehlt, ab wann es reicht.
 *
 * Was NICHT hier steht: das Lesen des Archivs und der Nachlauf selbst (AP9, `scripts/punktarchiv/**`), das
 * Schreiben nach `point/calib.json` (Publisher-Weg = S&F, E-F-20). Kein App-Modul importiert diese Datei
 * (0 Bundle); der Verifier `scripts/verify-calib-fit.mjs` prüft sie an einem synthetischen Archiv.
 *
 * ── Regeln ──────────────────────────────────────────────────────────────────
 *   • As-of: ein Fall zählt nur, wenn seine Wahrheit NACH der Slotzeit gilt und VOR dem Fit-Stichtag lag
 *     (Leck-Wächter; ein Fall mit Wahrheit vor dem Slot ist ein Fehler im Nachlauf ⇒ Abbruch).
 *   • Unabhängigkeit: die Einheit ist der Slot-Tag (Block-Bootstrap über Tage, `days` im Beleg); Punkte eines Tages
 *     sind räumlich korreliert und zählen als n, nicht als unabhängige Tage.
 *   • Geschrieben wird nur mit n ≥ n_min und Tagen ≥ min, bei Amplituden nur, wenn das 90-%-Intervall die Null
 *     ausschließt. Sonst: Status mit Grund, kein Wert.
 */

import { CALIB_BINS_H, CALIB_N_MIN, CALIB_VARS, CALIB_CONF_KEYS, calibBinOf, type CalibVar, type CalibConfKey } from './calibDoc';
import { crpsNormal } from '../pointForecast/fusion/dist';
import { fRadOf, windBlendingFactor, TERRAIN_SET } from '../pointForecast/fusion/terrainTerms';

export const FIT_VERSION = 'calibFit@1';
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Der Vertrag mit dem Nachlauf (AP9): Fallsätze
// ---------------------------------------------------------------------------

export interface FitCaseBase {
  pointId: string;
  /** Slot-Tag (YYYY-MM-DD, UTC) — die Einheit der Unabhängigkeit. */
  day: string;
  /** Slotzeit (ms) — der Stand, den die Vorhersage sah (as-of). */
  slotAtMs: number;
  /** Gültigkeitszeit der Wahrheit (ms); muss ≥ slotAtMs sein. */
  validAtMs: number;
  /** Vorlauf in Stunden AB DER SLOTZEIT (wie `lead:set` im Produkt: ab „jetzt"). */
  leadH: number;
  lat: number;
  lon: number;
  /** Land der Station (DE/AT/CH/…); Schichtung. */
  country: string;
  /** Stationshöhe (m) — Schichtung Höhenband. */
  elevM: number;
}

/** σ_sys, c, Konfidenz-Abschläge: das Cube-Member am Punkt (nach PAP 3–5) gegen die Wahrheit. */
export interface SigmaCase extends FitCaseBase {
  kind: 'sigma';
  var: CalibVar;
  /** Mittel des Cube-Members (PAP 3–5, vor der Kombination mit Station/Prior). */
  mu: number;
  obs: number;
  /** σ des Members OHNE σ_sys: √(σ_div² oder (c·σ_ens)², σ_quant², Höhenrest, Aufweitung) — wie `memberSigma` sie ohne sys rechnet. */
  sigmaNonSys: number;
  /** σ_ens der Stunde, wenn ein Ensemble sie trägt (für c), sonst `null`. */
  sigmaEns: number | null;
  /** Die Flags des Schritts (für die Konfidenz-Abschläge). */
  flags: string[];
  /** σ des Members wie ausgegeben (mit den Setzungen) — Bezugsgröße der Abschlag-Schätzung. */
  sigmaMember: number;
}

/** L_d, L_h, κ-λ: die Zellen des 2×2-Blocks mit ihren Werten, gegen die Wahrheit am Punkt (E-F-19). */
export interface GridCase extends FitCaseBase {
  kind: 'grid';
  tier: 't1' | 't2' | 't3';
  obs: number;
  /** σ des Members (für die CRPS der Gittersuche). */
  sigma: number;
  /** Die Blockzellen: Abstand, Modellhöhe gegen h_true, Landbedeckungs-Abstand δ (AP16; `null` ⇒ κ = 1), Wert der Größe (höhenkorrigiert wie PAP 4). */
  cells: Array<{ distM: number; dhM: number | null; landDelta: number | null; value: number }>;
}

/** A, A_uhi, f_rad: Nachtschritte mit Geometrie der Geländeterme (mit Amplitude 1) gegen die Wahrheit. */
export interface TermCase extends FitCaseBase {
  kind: 'terms';
  obs: number;
  /** Mittel ohne Geländeterme (A = A_uhi = 0). */
  muNoTerms: number;
  clct: number;
  windMs: number;
  /** g der Mulde (Tiefe, SVF), 0…1 — `null` ⇒ keine Geometrie. */
  gCap: number | null;
  basin: boolean | null;
  /** g der Stadt (imperv, SVF), 0…1. */
  gUhi: number | null;
  fSaison: number;
  foehnFactor: number;
}

/** z_b: der 10-m-Wind des Modells, die Rauhigkeiten, gegen den gemessenen Wind. */
export interface WindCase extends FitCaseBase {
  kind: 'wind';
  obs: number;
  modWind: number;
  z0Mod: number;
  z0True: number;
  d0True: number;
}

/** meltOffset: Niederschlagsstunden mit beobachteter Phase (POI present_weather, V-FI-76) — nur DE. */
export interface PhaseCase extends FitCaseBase {
  kind: 'phase';
  /** 1 = Schnee beobachtet, 0 = Regen (Mischphase als 0,5 wird nicht geführt: der Nachlauf wählt eine Seite oder lässt den Fall weg). */
  snow: 0 | 1;
  hTrue: number;
  /** Höhe der Feuchtkugel-Nullgradgrenze am Punkt (m ü. NN) aus der Vorhersage. */
  zWetZeroM: number;
}

export type FitCase = SigmaCase | GridCase | TermCase | WindCase | PhaseCase;

/** tpiSigma braucht kein Archiv: TPI-Werte aus dem Geländestack je Region. */
export interface TpiSample { region: string; tpiM: number }

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface RegistryEntry {
  path: string;
  estimator: string;
  strata: string;
  needs: string;
  /** Aus dem Archiv fitbar? `false` = benannt, aber nie von diesem Fit geschrieben. */
  fittable: boolean;
}

export const CALIB_REGISTRY: readonly RegistryEntry[] = Object.freeze([
  { path: 'sigmaSys', estimator: 'Momente: E[(o−μ)²] − E[σ²_ohne sys], Block-Bootstrap über Tage, geblockte Raum-CV (1°-Kacheln)', strata: 'Größe × Vorlauf-Bin; berichtet Land DE / AT+CH, Höhenband < / ≥ 800 m', needs: 'Nachlauf AP9 (SigmaCase)', fittable: true },
  { path: 'cSpread', estimator: 'Spread/Skill √(E[(o−μ)²]/E[σ_ens²]) an Stunden mit Ensemble', strata: 'Größe × Vorlauf-Bin', needs: 'Nachlauf AP9 (SigmaCase mit σ_ens)', fittable: true },
  { path: 'confDiscount', estimator: 'CRPS-Verhältnis ohne/mit Flag bei gleicher Größe und gleichem Bin, geklemmt 0,3…1', strata: 'Flag', needs: 'Nachlauf AP9 (SigmaCase mit Flags)', fittable: true },
  { path: 'Ld', estimator: 'CRPS-Gittersuche (0,5–2× Zellweite), Leave-one-region-out', strata: 'Stufe', needs: '2×2-Block im Archiv (E-F-19)', fittable: true },
  { path: 'Lh', estimator: 'CRPS-Gittersuche (100–800 m), Leave-one-region-out', strata: 'Stufe', needs: '2×2-Block im Archiv (E-F-19)', fittable: true },
  { path: 'kappaLambda', estimator: 'CRPS-Gittersuche λ ∈ {0,5; 1; 2; ∞}', strata: 'Stufe t1/t2', needs: '2×2-Block + Landbedeckung zur Fit-Zeit (AP16)', fittable: true },
  { path: 'zBlend', estimator: 'Gittersuche z_b (20–150 m) auf MAE(ln Wind)', strata: 'z0-Klasse', needs: 'Nachlauf + z0 zur Fit-Zeit', fittable: true },
  { path: 'A', estimator: 'Kleinste Quadrate r = −A·x_cap + A_uhi·x_uhi (x mit f_rad aus der Gittersuche), Block-Bootstrap', strata: 'Nacht, Muldenstationen', needs: 'Gelände + urban zur Fit-Zeit', fittable: true },
  { path: 'Auhi', estimator: 'wie A (gemeinsam gefittet)', strata: 'Nacht, Stadtstationen', needs: 'urban zur Fit-Zeit', fittable: true },
  { path: 'fRad.a', estimator: 'Gittersuche gemeinsam mit A/A_uhi (Rest-Quadratsumme)', strata: 'Nacht', needs: 'wie A', fittable: true },
  { path: 'fRad.vRef', estimator: 'wie fRad.a', strata: 'Nacht', needs: 'wie A', fittable: true },
  { path: 'fRad.epsilon', estimator: 'wie fRad.a', strata: 'Nacht', needs: 'wie A', fittable: true },
  { path: 'meltOffset', estimator: 'Maximum-Likelihood, logistische Phase P(Schnee) = σ((h − (z_w0 − m))/s)', strata: 'Höhenband; nur DE (POI)', needs: 'POI-Wetterspalten im Archiv (V-FI-76)', fittable: true },
  { path: 'tpiSigma', estimator: 'Standardabweichung des TPI je Region', strata: 'Region', needs: 'Geländestack (kein Archiv)', fittable: true },
  { path: 'phi.knots', estimator: 'isotone Regression (o − T̄)/dT_inv gegen u in Fall B', strata: 'Stufe', needs: 'Nachlauf mit Fall B (Winter)', fittable: false },
  { path: 'poolDepth', estimator: 'Tiefenregel an Fall C', strata: 'Stufe', needs: 'Nachlauf mit Fall C (Winter)', fittable: false },
  { path: 'dzMin', estimator: '—', strata: '—', needs: 'Modelllevel (nicht archiviert, V-FI-71)', fittable: false },
]);

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** LCG wie `verify-pv-score.mjs` (Saat 12345) — deterministisch. */
function lcg(seed = 12345) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
const quantile = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] : NaN; };
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Block-Bootstrap über Tage: 90-%-Intervall einer Statistik. */
function bootstrapDays<T extends { day: string }>(cases: readonly T[], stat: (cs: T[]) => number, draws = 200, seed = 12345): [number, number] {
  const byDay = new Map<string, T[]>();
  for (const c of cases) { const a = byDay.get(c.day); if (a) a.push(c); else byDay.set(c.day, [c]); }
  const days = [...byDay.values()];
  const rnd = lcg(seed);
  const out: number[] = [];
  for (let b = 0; b < draws; b++) {
    const sample: T[] = [];
    for (let i = 0; i < days.length; i++) sample.push(...days[Math.floor(rnd() * days.length)]);
    const v = stat(sample);
    if (Number.isFinite(v)) out.push(v);
  }
  return [quantile(out, 0.05), quantile(out, 0.95)];
}

const daysOf = (cases: readonly { day: string }[]) => new Set(cases.map((c) => c.day)).size;
const blockOf = (c: { lat: number; lon: number }) => `${Math.floor(c.lat)}_${Math.floor(c.lon)}`;

// ---------------------------------------------------------------------------
// Ergebnis und Diagnose
// ---------------------------------------------------------------------------

export type FitStatus = 'written' | 'too-short' | 'not-significant' | 'no-cases' | 'not-fittable';

export interface FitReportRow {
  path: string;
  status: FitStatus;
  n: number;
  days: number;
  needN: number;
  needDays: number;
  /** Wann der Beleg reicht (YYYY-MM-DD), hochgerechnet mit der bisherigen Rate — nur bei `too-short`. */
  eta?: string | null;
  why?: string;
  value?: unknown;
  ci90?: unknown;
  cv?: unknown;
}

export interface FitEntry {
  value: unknown; provenance: 'measured'; source: string; updatedAt: string; unit?: string; pap?: string;
  n: unknown; days: unknown; period: { from: string; to: string }; estimator: string; strata: string; ci90?: unknown; fitVersion: string;
  binsH?: typeof CALIB_BINS_H;
}

export interface FitResult {
  /** `ok` = mindestens ein Parameter geschrieben; sonst der harte Abbruch mit Diagnose. */
  verdict: 'ok' | 'Archiv zu kurz';
  entries: Record<string, FitEntry>;
  report: FitReportRow[];
  excluded: { afterAsOf: number };
  period: { from: string; to: string } | null;
  diagnosis: string[];
}

export interface FitOptions {
  /** Fit-Stichtag (ms): Wahrheit danach zählt nicht (Leck-Wächter). */
  asOfMs: number;
  tpi?: readonly TpiSample[];
  /** Nur zum Testen: Mindestbeleg überschreiben. */
  nMin?: Partial<Record<string, { n: number; days: number }>>;
}

function etaOf(n: number, days: number, need: { n: number; days: number }, lastDay: string | null): string | null {
  if (!lastDay) return null;
  const perDay = days > 0 ? n / days : 0;
  const moreByN = n >= need.n ? 0 : perDay > 0 ? Math.ceil((need.n - n) / perDay) : Infinity;
  const moreByDays = Math.max(0, need.days - days);
  const more = Math.max(moreByN, moreByDays);
  if (!Number.isFinite(more)) return null;
  return new Date(Date.parse(lastDay) + more * DAY_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Der Fit
// ---------------------------------------------------------------------------

export function fitCalib(allCases: readonly FitCase[], opts: FitOptions): FitResult {
  // Leck-Wächter und as-of.
  for (const c of allCases) {
    if (c.validAtMs < c.slotAtMs) throw new Error(`calibFit: as-of verletzt — Wahrheit ${new Date(c.validAtMs).toISOString()} vor dem Slot ${new Date(c.slotAtMs).toISOString()} (${c.pointId}); der Nachlauf liefert falsche Fälle`);
  }
  const cases = allCases.filter((c) => c.validAtMs <= opts.asOfMs);
  const excluded = { afterAsOf: allCases.length - cases.length };
  const need = (path: string) => ({ ...CALIB_N_MIN[path], ...(opts.nMin?.[path] ?? {}) }) as { n: number; days: number };
  const days = [...new Set(cases.map((c) => c.day))].sort();
  const period = days.length ? { from: days[0], to: days[days.length - 1] } : null;
  const lastDay = days.length ? days[days.length - 1] : null;
  const updatedAt = new Date(opts.asOfMs).toISOString();
  const entries: Record<string, FitEntry> = {};
  const report: FitReportRow[] = [];
  const base = (path: string, estimator: string, strata: string) => ({
    provenance: 'measured' as const, updatedAt, period: period!, estimator, strata, fitVersion: FIT_VERSION,
    source: `buscosun-archiv, Fit ${FIT_VERSION} (${estimator}); Zeitraum ${period?.from}…${period?.to}`,
    pap: path.startsWith('sigma') || path === 'cSpread' || path === 'confDiscount' || path === 'meltOffset' ? 'PAP 6' : path === 'Ld' || path === 'Lh' || path === 'kappaLambda' ? 'PAP 3' : 'PAP 5',
  });
  const tooShort = (path: string, n: number, d: number, why?: string): FitReportRow => {
    const nd = need(path);
    return { path, status: n === 0 ? 'no-cases' : 'too-short', n, days: d, needN: nd.n, needDays: nd.days, eta: n === 0 ? null : etaOf(n, d, nd, lastDay), ...(why ? { why } : {}) };
  };

  // ── σ_sys und c je Größe × Bin ─────────────────────────────────────────────
  const sig = cases.filter((c): c is SigmaCase => c.kind === 'sigma');
  const binned = (path: 'sigmaSys' | 'cSpread') => {
    const nd = need(path);
    const value: Record<string, Array<number | null>> = {};
    const nOut: Record<string, number[]> = {};
    const dOut: Record<string, number[]> = {};
    const ci: Record<string, Array<[number, number] | null>> = {};
    const cvOut: Record<string, Array<number | null>> = {};
    let any = false, nTot = 0, dMax = 0;
    for (const v of CALIB_VARS) {
      const vc = sig.filter((c) => c.var === v && (path === 'sigmaSys' || (c.sigmaEns != null && c.sigmaEns > 0)));
      if (!vc.length) continue;
      value[v] = []; nOut[v] = []; dOut[v] = []; ci[v] = []; cvOut[v] = [];
      for (let b = 0; b < CALIB_BINS_H.length; b++) {
        const bc = vc.filter((c) => calibBinOf(c.leadH) === b);
        const d = daysOf(bc);
        nOut[v].push(bc.length); dOut[v].push(d);
        nTot += bc.length; dMax = Math.max(dMax, d);
        const est = (cs: SigmaCase[]) => path === 'sigmaSys'
          ? Math.sqrt(Math.max(0, mean(cs.map((c) => (c.obs - c.mu) ** 2)) - mean(cs.map((c) => c.sigmaNonSys ** 2))))
          : Math.sqrt(mean(cs.map((c) => (c.obs - c.mu) ** 2)) / mean(cs.map((c) => (c.sigmaEns as number) ** 2)));
        if (bc.length < nd.n || d < nd.days) { value[v].push(null); ci[v].push(null); cvOut[v].push(null); continue; }
        const x = est(bc);
        if (!(x > 0)) { value[v].push(null); ci[v].push(null); cvOut[v].push(null); continue; }
        value[v].push(r4(x));
        const [lo, hi] = bootstrapDays(bc, est);
        ci[v].push([r4(lo), r4(hi)]);
        // Geblockte Raum-CV (nur σ_sys): σ_sys ohne den Block, Spread/Skill im Block.
        if (path === 'sigmaSys') {
          const blocks = [...new Set(bc.map(blockOf))];
          const ratios: number[] = [];
          for (const bl of blocks) {
            const inB = bc.filter((c) => blockOf(c) === bl), out = bc.filter((c) => blockOf(c) !== bl);
            if (inB.length < 20 || out.length < 20) continue;
            const s = est(out);
            ratios.push(Math.sqrt(mean(inB.map((c) => c.sigmaNonSys ** 2 + s * s)) / mean(inB.map((c) => (c.obs - c.mu) ** 2))));
          }
          cvOut[v].push(ratios.length ? r4(mean(ratios)) : null);
        } else cvOut[v].push(null);
        any = true;
      }
    }
    const estimator = path === 'sigmaSys' ? 'Momente + Block-Bootstrap über Tage' : 'Spread/Skill + Block-Bootstrap über Tage';
    if (any) {
      entries[path] = { ...base(path, estimator, 'Größe × Vorlauf-Bin, DACH gepoolt'), value, n: nOut, days: dOut, ci90: ci, binsH: CALIB_BINS_H, unit: path === 'sigmaSys' ? 'Einheit der Größe' : '—' };
      report.push({ path, status: 'written', n: nTot, days: dMax, needN: nd.n, needDays: nd.days, value, ci90: ci, cv: path === 'sigmaSys' ? { spreadSkillHeldOut: cvOut } : undefined });
    } else report.push(tooShort(path, nTot, dMax, 'kein Bin erreicht n_min und die Mindesttage'));
  };
  binned('sigmaSys');
  binned('cSpread');

  // ── Konfidenz-Abschläge je Flag ────────────────────────────────────────────
  {
    const path = 'confDiscount', nd = need(path);
    const value: Partial<Record<CalibConfKey, number>> = {}, nOut: Record<string, number> = {}, ci: Record<string, [number, number]> = {};
    const flagOf: Record<CalibConfKey, string> = { caseC: 'extrapolatedBelowModel', caseB: 'inversionBody', dhOver300: 'dhOver300', chunkBorder: 'chunkBorderTruncated', interpolated: 'interpolated', nowcastFallback: 'nowcastFallbackModel', stationFar: 'stationFar' };
    const crps = (c: SigmaCase) => crpsNormal(c.mu, c.sigmaMember, c.obs) / Math.max(1e-9, c.sigmaMember);
    let nTot = 0;
    for (const k of CALIB_CONF_KEYS) {
      const withF = sig.filter((c) => c.flags.includes(flagOf[k]));
      nTot += withF.length;
      if (withF.length < nd.n || daysOf(withF) < nd.days) continue;
      const strata = new Set(withF.map((c) => `${c.var}|${calibBinOf(c.leadH)}`));
      const without = sig.filter((c) => !c.flags.includes(flagOf[k]) && strata.has(`${c.var}|${calibBinOf(c.leadH)}`));
      if (without.length < nd.n) continue;
      const est = (cs: SigmaCase[]) => {
        const a = cs.filter((c) => c.flags.includes(flagOf[k])), b = cs.filter((c) => !c.flags.includes(flagOf[k]));
        return Math.min(1, Math.max(0.3, mean(b.map(crps)) / mean(a.map(crps))));
      };
      value[k] = r4(est([...withF, ...without]));
      nOut[k] = withF.length;
      const [lo, hi] = bootstrapDays([...withF, ...without], est);
      ci[k] = [r4(lo), r4(hi)];
    }
    if (Object.keys(value).length) {
      entries[path] = { ...base(path, 'CRPS-Verhältnis ohne/mit Flag (normiert mit σ), Block-Bootstrap', 'Flag, gepaart über Größe × Bin'), value, n: nOut, days: daysOf(sig), ci90: ci };
      report.push({ path, status: 'written', n: nTot, days: daysOf(sig), needN: nd.n, needDays: nd.days, value, ci90: ci });
    } else report.push(tooShort(path, nTot, daysOf(sig), 'kein Flag mit genug markierten Fällen'));
  }

  // ── L_d, L_h, κ-λ: CRPS-Gittersuche mit Leave-one-region-out ────────────────
  {
    const grid = cases.filter((c): c is GridCase => c.kind === 'grid');
    const nd = need('Lh'), d = daysOf(grid);
    if (grid.length < nd.n || d < nd.days) {
      for (const p of ['Ld', 'Lh', 'kappaLambda']) report.push(tooShort(p, grid.length, d));
    } else {
      const cellW: Record<string, number> = { t1: 0.05 * 110_574, t2: 0.10 * 110_574, t3: 0.25 * 110_574 };
      const LD_F = [0.5, 0.75, 1, 1.5, 2], LH = [100, 150, 200, 250, 300, 400, 500, 600, 800], LAM = [0.5, 1, 2, Infinity];
      const hasLand = grid.some((c) => c.cells.some((x) => x.landDelta != null));
      const lams = hasLand ? LAM : [Infinity];
      const predict = (c: GridCase, fd: number, lh: number, lam: number) => {
        const ld = fd * cellW[c.tier];
        let sw = 0, sv = 0;
        for (const x of c.cells) {
          const w = Math.exp(-((x.distM / ld) ** 2)) * (x.dhM == null ? 1 : Math.exp(-((x.dhM / lh) ** 2))) * (x.landDelta == null || !Number.isFinite(lam) ? 1 : Math.exp(-x.landDelta / lam));
          sw += w; sv += w * x.value;
        }
        return sw > 0 ? sv / sw : c.cells[0].value;
      };
      const score = (cs: GridCase[], fd: number, lh: number, lam: number) => mean(cs.map((c) => crpsNormal(predict(c, fd, lh, lam), c.sigma, c.obs)));
      const argmin = (cs: GridCase[]) => {
        let best = { fd: 1, lh: 200, lam: Infinity, s: Infinity };
        for (const fd of LD_F) for (const lh of LH) for (const lam of lams) { const s = score(cs, fd, lh, lam); if (s < best.s) best = { fd, lh, lam, s }; }
        return best;
      };
      const all = argmin(grid);
      // Leave-one-region-out: Gewinn gegen die Setzung (L_d = Zellweite, L_h = 200 m, κ = 1) im ausgelassenen Block —
      // über die 12 fallstärksten 1°-Kacheln (deterministisch; die Gittersuche je Auslassung ist der teure Teil).
      const counts = new Map<string, number>();
      for (const c of grid) counts.set(blockOf(c), (counts.get(blockOf(c)) ?? 0) + 1);
      const regions = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([k]) => k);
      const gains: number[] = [];
      for (const rg of regions) {
        const inR = grid.filter((c) => blockOf(c) === rg), out = grid.filter((c) => blockOf(c) !== rg);
        if (inR.length < 30 || out.length < 30) continue;
        const b = argmin(out);
        gains.push(1 - score(inR, b.fd, b.lh, b.lam) / score(inR, 1, 200, Infinity));
      }
      const cv = { crpssVsSetHeldOut: gains.length ? r4(mean(gains)) : null, regions: gains.length };
      const est = 'CRPS-Gittersuche, Leave-one-region-out (1°-Kacheln)';
      entries.Ld = { ...base('Ld', est, 'Stufe'), value: Object.fromEntries(['t1', 't2', 't3'].filter((t) => grid.some((c) => c.tier === t)).map((t) => [t, Math.round(all.fd * cellW[t])])), n: grid.length, days: d, unit: 'm' };
      entries.Lh = { ...base('Lh', est, 'alle Stufen'), value: all.lh, n: grid.length, days: d, unit: 'm' };
      report.push({ path: 'Ld', status: 'written', n: grid.length, days: d, needN: need('Ld').n, needDays: need('Ld').days, value: entries.Ld.value, cv });
      report.push({ path: 'Lh', status: 'written', n: grid.length, days: d, needN: nd.n, needDays: nd.days, value: all.lh, cv });
      if (hasLand && Number.isFinite(all.lam)) {
        entries.kappaLambda = { ...base('kappaLambda', est, 'Stufe t1/t2'), value: all.lam, n: grid.length, days: d };
        report.push({ path: 'kappaLambda', status: 'written', n: grid.length, days: d, needN: need('kappaLambda').n, needDays: need('kappaLambda').days, value: all.lam, cv });
      } else report.push({ path: 'kappaLambda', status: 'not-significant', n: grid.length, days: d, needN: need('kappaLambda').n, needDays: need('kappaLambda').days, why: hasLand ? 'λ = ∞ gewinnt (κ ohne Wirkung)' : 'keine Landbedeckung in den Fällen (AP16)' });
    }
  }

  // ── A, A_uhi, f_rad: gemeinsame Kleinste Quadrate mit Gittersuche über f_rad ─
  {
    const tc = cases.filter((c): c is TermCase => c.kind === 'terms');
    const ndA = need('A'), d = daysOf(tc);
    const design = (c: TermCase, a: number, vRef: number, eps: number) => {
      const f = fRadOf(c.clct, c.windMs, { a, vRefMs: vRef });
      if (f == null || f < eps) return { xc: 0, xu: 0 };
      const xc = c.basin && c.gCap != null ? c.gCap * f * c.fSaison * c.foehnFactor : 0;
      const xu = c.gUhi != null ? c.gUhi * f * c.fSaison : 0;
      return { xc, xu };
    };
    const solve = (cs: TermCase[], a: number, vRef: number, eps: number) => {
      // r = −A·xc + Auhi·xu  ⇒ Normalgleichungen 2×2 (xc, xu)
      let scc = 0, suu = 0, scu = 0, scr = 0, sur = 0;
      for (const c of cs) { const { xc, xu } = design(c, a, vRef, eps); const r = c.obs - c.muNoTerms; scc += xc * xc; suu += xu * xu; scu += xc * xu; scr += xc * r; sur += xu * r; }
      const det = scc * suu - scu * scu;
      let A = 0, Au = 0;
      if (Math.abs(det) > 1e-12) { const bc = (scr * suu - sur * scu) / det, bu = (sur * scc - scr * scu) / det; A = -bc; Au = bu; }
      else if (scc > 1e-12) A = -scr / scc; else if (suu > 1e-12) Au = sur / suu;
      let sse = 0; for (const c of cs) { const { xc, xu } = design(c, a, vRef, eps); const e = c.obs - c.muNoTerms - (-A * xc + Au * xu); sse += e * e; }
      return { A, Au, sse };
    };
    const informative = tc.filter((c) => (c.basin && (c.gCap ?? 0) > 0) || (c.gUhi ?? 0) > 0);
    if (informative.length < ndA.n || daysOf(informative) < ndA.days) {
      for (const p of ['A', 'Auhi', 'fRad.a', 'fRad.vRef', 'fRad.epsilon']) report.push(tooShort(p, informative.length, daysOf(informative)));
    } else {
      let best: { a: number; vRef: number; eps: number; A: number; Au: number; sse: number } = { a: TERRAIN_SET.a, vRef: TERRAIN_SET.vRefMs, eps: TERRAIN_SET.epsilon, A: 0, Au: 0, sse: Infinity };
      for (const a of [0.5, 1, 2]) for (const vRef of [1.5, 2.5, 4]) for (const eps of [0.05, TERRAIN_SET.epsilon, 0.25]) {
        const s = solve(tc, a, vRef, eps);
        if (s.sse < best.sse) best = { a, vRef, eps, ...s };
      }
      const [aLo, aHi] = bootstrapDays(tc, (cs) => solve(cs, best.a, best.vRef, best.eps).A);
      const [uLo, uHi] = bootstrapDays(tc, (cs) => solve(cs, best.a, best.vRef, best.eps).Au);
      const est = 'Kleinste Quadrate (−A·x_cap + A_uhi·x_uhi) mit f_rad-Gittersuche, Block-Bootstrap';
      const signif = (lo: number, hi: number) => lo > 0 || hi < 0;
      const nC = tc.filter((c) => c.basin && (c.gCap ?? 0) > 0).length, nU = tc.filter((c) => (c.gUhi ?? 0) > 0).length;
      if (signif(aLo, aHi) && nC >= ndA.n) {
        entries.A = { ...base('A', est, 'Nacht, Muldenstationen, DACH gepoolt'), value: { default: r4(best.A) }, n: nC, days: d, ci90: { default: [r4(aLo), r4(aHi)] }, unit: 'K' };
        report.push({ path: 'A', status: 'written', n: nC, days: d, needN: ndA.n, needDays: ndA.days, value: r4(best.A), ci90: [r4(aLo), r4(aHi)] });
      } else report.push({ path: 'A', status: nC < ndA.n ? 'too-short' : 'not-significant', n: nC, days: d, needN: ndA.n, needDays: ndA.days, ci90: [r4(aLo), r4(aHi)], why: nC < ndA.n ? 'zu wenige Muldenfälle' : '90-%-Intervall schließt 0 ein' });
      const ndU = need('Auhi');
      if (signif(uLo, uHi) && nU >= ndU.n) {
        entries.Auhi = { ...base('Auhi', est, 'Nacht, Stadtstationen, DACH gepoolt'), value: { default: r4(best.Au) }, n: nU, days: d, ci90: { default: [r4(uLo), r4(uHi)] }, unit: 'K' };
        report.push({ path: 'Auhi', status: 'written', n: nU, days: d, needN: ndU.n, needDays: ndU.days, value: r4(best.Au), ci90: [r4(uLo), r4(uHi)] });
      } else report.push({ path: 'Auhi', status: nU < ndU.n ? 'too-short' : 'not-significant', n: nU, days: d, needN: ndU.n, needDays: ndU.days, ci90: [r4(uLo), r4(uHi)], why: nU < ndU.n ? 'zu wenige Stadtfälle' : '90-%-Intervall schließt 0 ein' });
      // f_rad nur, wenn mindestens eine Amplitude trägt — sonst ist die Gittersuche ohne Aussage.
      if (entries.A || entries.Auhi) {
        for (const [p, v] of [['fRad.a', best.a], ['fRad.vRef', best.vRef], ['fRad.epsilon', best.eps]] as const) {
          entries[p] = { ...base(p, 'Gittersuche gemeinsam mit A/A_uhi (Rest-Quadratsumme)', 'Nacht'), value: r4(v), n: informative.length, days: d };
          report.push({ path: p, status: 'written', n: informative.length, days: d, needN: need(p).n, needDays: need(p).days, value: r4(v) });
        }
      } else for (const p of ['fRad.a', 'fRad.vRef', 'fRad.epsilon']) report.push({ path: p, status: 'not-significant', n: informative.length, days: d, needN: need(p).n, needDays: need(p).days, why: 'keine Amplitude trägt' });
    }
  }

  // ── z_b: Gittersuche auf MAE(ln Wind) ───────────────────────────────────────
  {
    const wc = cases.filter((c): c is WindCase => c.kind === 'wind' && c.obs > 0 && c.modWind > 0);
    const nd = need('zBlend'), d = daysOf(wc);
    if (wc.length < nd.n || d < nd.days) report.push(tooShort('zBlend', wc.length, d));
    else {
      const loss = (cs: WindCase[], zb: number) => mean(cs.map((c) => { const f = windBlendingFactor(c.z0Mod, c.z0True, 0, c.d0True, zb) ?? 1; return Math.abs(Math.log(c.obs / (c.modWind * f))); }));
      const ZB = [20, 40, 60, 80, 100, 150];
      let best = ZB[0], bs = Infinity;
      for (const zb of ZB) { const s = loss(wc, zb); if (s < bs) { bs = s; best = zb; } }
      const setLoss = loss(wc, TERRAIN_SET.zBlendM);
      entries.zBlend = { ...base('zBlend', 'Gittersuche z_b auf MAE(ln Wind)', 'alle Stationen'), value: best, n: wc.length, days: d, unit: 'm' };
      report.push({ path: 'zBlend', status: 'written', n: wc.length, days: d, needN: nd.n, needDays: nd.days, value: best, cv: { maeLnFit: r4(bs), maeLnSet: r4(setLoss) } });
    }
  }

  // ── meltOffset: Maximum-Likelihood der logistischen Phase ──────────────────
  {
    const pc = cases.filter((c): c is PhaseCase => c.kind === 'phase');
    const nd = need('meltOffset'), d = daysOf(pc);
    if (pc.length < nd.n || d < nd.days) report.push(tooShort('meltOffset', pc.length, d, pc.length ? undefined : 'keine Phasenfälle (POI-Wetterspalten, V-FI-76)'));
    else {
      const nll = (cs: PhaseCase[], m: number, s: number) => {
        let L = 0;
        for (const c of cs) { const p = 1 / (1 + Math.exp(-(c.hTrue - (c.zWetZeroM - m)) / s)); const q = Math.min(1 - 1e-9, Math.max(1e-9, p)); L -= c.snow ? Math.log(q) : Math.log(1 - q); }
        return L;
      };
      const fitM = (cs: PhaseCase[]) => {
        let best = { m: 0, s: 100, L: Infinity };
        for (let m = -600; m <= 600; m += 10) for (const s of [25, 50, 100, 150, 200, 300]) { const L = nll(cs, m, s); if (L < best.L) best = { m, s, L }; }
        return best;
      };
      const b = fitM(pc);
      const [lo, hi] = bootstrapDays(pc, (cs) => fitM(cs).m, 60);
      entries.meltOffset = { ...base('meltOffset', 'Maximum-Likelihood, logistische Phase', 'nur DE (POI)'), value: b.m, n: pc.length, days: d, ci90: [lo, hi], unit: 'm' };
      report.push({ path: 'meltOffset', status: 'written', n: pc.length, days: d, needN: nd.n, needDays: nd.days, value: b.m, ci90: [lo, hi], cv: { widthM: b.s } });
    }
  }

  // ── tpiSigma: aus dem Gelände, kein Archiv ─────────────────────────────────
  {
    const t = opts.tpi ?? [];
    const nd = need('tpiSigma');
    if (t.length < nd.n) report.push({ path: 'tpiSigma', status: t.length ? 'too-short' : 'no-cases', n: t.length, days: 0, needN: nd.n, needDays: nd.days, why: 'TPI-Stichprobe aus dem Geländestack fehlt oder ist zu klein' });
    else {
      const regions = [...new Set(t.map((x) => x.region))];
      const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
      const value: Record<string, number> = { default: r4(sd(t.map((x) => x.tpiM))) };
      for (const r of regions) { const xs = t.filter((x) => x.region === r).map((x) => x.tpiM); if (xs.length >= nd.n && r !== 'default') value[r] = r4(sd(xs)); }
      // AP16 (V-FI-97): die Herkunft ist das Gelände, nicht das Archiv — und ohne Archivfälle gibt es keinen Zeitraum.
      entries.tpiSigma = { ...base('tpiSigma', 'Standardabweichung des TPI je Region', 'Region'), value, n: t.length, days: 0, unit: 'm',
        period: period ?? { from: updatedAt.slice(0, 10), to: updatedAt.slice(0, 10) },
        source: `Geländestack (TPI am Punkt, keine Archivfälle), Fit ${FIT_VERSION} (Standardabweichung des TPI je Region); Stichprobe n ${t.length}, Regionen ${regions.join('/')}` };
      report.push({ path: 'tpiSigma', status: 'written', n: t.length, days: 0, needN: nd.n, needDays: nd.days, value });
    }
  }

  // ── nicht aus dem Archiv fitbar (benannt) ───────────────────────────────────
  for (const r of CALIB_REGISTRY) if (!r.fittable) report.push({ path: r.path, status: 'not-fittable', n: 0, days: 0, needN: CALIB_N_MIN[r.path]?.n ?? 0, needDays: CALIB_N_MIN[r.path]?.days ?? 0, why: r.needs });

  const written = Object.keys(entries);
  const verdict = written.length ? 'ok' : 'Archiv zu kurz';
  const diagnosis = report.filter((r) => r.status !== 'written').map((r) =>
    `${r.path}: ${r.status}${r.why ? ` (${r.why})` : ''} — n ${r.n}/${r.needN}, Tage ${r.days}/${r.needDays}${r.eta ? `, reif ≈ ${r.eta}` : ''}`);
  if (verdict === 'Archiv zu kurz') diagnosis.unshift(`Archiv zu kurz: ${days.length} Slot-Tage (${period ? `${period.from}…${period.to}` : 'keine'}), ${cases.length} Fälle — kein Parameter erreicht seinen Mindestbeleg; nichts geschrieben`);
  return { verdict, entries, report, excluded, period, diagnosis };
}

/** Die geschriebenen Einträge in ein Schema-2-Dokument einsetzen (auf dem ausgelieferten Inhalt) — für Prüfung und Publisher. */
export function calibDocumentWith(base: Record<string, unknown>, entries: Record<string, FitEntry>, updatedAt: string): Record<string, unknown> {
  const doc = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  doc.schema = 2;
  doc.updatedAt = updatedAt;
  for (const [path, e] of Object.entries(entries)) {
    const parts = path.split('.');
    let o = doc;
    for (const p of parts.slice(0, -1)) { if (typeof o[p] !== 'object' || o[p] == null) o[p] = {}; o = o[p] as Record<string, unknown>; }
    o[parts[parts.length - 1]] = e;
  }
  return doc;
}
