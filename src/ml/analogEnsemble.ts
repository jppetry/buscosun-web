/**
 * Analog-Ensemble (ML #3) — kalibrierte EMPIRISCHE Vorhersage-Verteilung aus
 * der Orts-Historie. Statt eine Verteilung anzunehmen (EMOS), sucht es die
 * ähnlichsten früheren Tage („Analoga") und nimmt deren tatsächliche Outcomes
 * als Ensemble. Etablierte Methode (Analog Ensemble) — definierte Methodik,
 * keine Blackbox; reuse desselben ERA5/Meteostat-Fetches wie ML #1/#2.
 *
 * Generisch: Prädiktoren rein (z. B. vom Live-Modell vorhergesagter Zustand
 * oder Persistenz), Outcome-Verteilung raus (Quantile, PoP, Extremrisiko,
 * ähnliche Daten). Saison-gefenstertes, gewichtetes k-NN auf standardisierten
 * Prädiktoren. Rein & headless prüfbar ({@link verifyAnalogEnsemble}).
 */

import { meanCrps } from './metrics';

const YEAR = 365.25;

export interface AnalogDay {
  doy: number;
  year: number;
  dateISO: string;
  /** Prädiktor-Vektor (gleiche Reihenfolge wie Query). */
  predictors: number[];
  /** Zielgröße (das, was vorhergesagt wird). */
  outcome: number;
}

export interface AnalogIndex {
  days: AnalogDay[];
  mu: number[];
  sd: number[];
  weights: number[];
  windowDays: number;
  /** Tage gebündelt nach ganzzahligem Tag-des-Jahres (1..366) — schnelle Fenstersuche. */
  byDoy: AnalogDay[][];
}

export interface AnalogQuery { doy: number; predictors: number[] }

export interface AnalogMatch { dateISO: string; year: number; distance: number; outcome: number }

export interface AnalogResult {
  /** Outcomes der k Analoga = das Ensemble. */
  members: number[];
  mean: number;
  p10: number; p50: number; p90: number;
  /** Wahrscheinlichkeit outcome ≥ threshold (wenn threshold gesetzt). */
  pop: number | null;
  /** Top-Analoga (für „ähnelt dem <Datum>"). */
  analogs: AnalogMatch[];
  /** Wie viele Tage tatsächlich im Fenster gefunden wurden. */
  pool: number;
}

/** Zyklische Tag-des-Jahres-Distanz. */
function doyDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, YEAR - d);
}

function meanStd(xs: number[]): { mu: number; sd: number } {
  if (xs.length === 0) return { mu: 0, sd: 1 };
  const mu = xs.reduce((s, x) => s + x, 0) / xs.length;
  let v = 0; for (const x of xs) v += (x - mu) * (x - mu);
  return { mu, sd: Math.sqrt(v / xs.length) || 1 };
}

/** Baut den Analog-Index: standardisiert die Prädiktoren. */
export function buildAnalogIndex(days: AnalogDay[], opts: { weights?: number[]; windowDays?: number } = {}): AnalogIndex {
  const valid = days.filter((d) => d.predictors.every(Number.isFinite) && Number.isFinite(d.outcome));
  const dim = valid.length ? valid[0].predictors.length : 0;
  const mu: number[] = [], sd: number[] = [];
  for (let j = 0; j < dim; j++) { const { mu: m, sd: s } = meanStd(valid.map((d) => d.predictors[j])); mu.push(m); sd.push(s); }
  const weights = opts.weights && opts.weights.length === dim ? opts.weights : new Array(dim).fill(1);
  const byDoy: AnalogDay[][] = Array.from({ length: 367 }, () => []);
  for (const d of valid) { const k = Math.max(1, Math.min(366, Math.round(d.doy))); byDoy[k].push(d); }
  return { days: valid, mu, sd, weights, windowDays: opts.windowDays ?? 15, byDoy };
}

/** Sammelt alle Tage im zyklischen Saisonfenster [doy−w, doy+w] über die Buckets. */
function daysInWindow(index: AnalogIndex, doy: number, w: number): AnalogDay[] {
  const out: AnalogDay[] = [];
  const center = Math.round(doy);
  for (let off = -w; off <= w; off++) {
    let k = center + off;
    if (k < 1) k += 366; else if (k > 366) k -= 366;
    const bucket = index.byDoy[k];
    if (bucket) for (const d of bucket) out.push(d);
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Sucht die k ähnlichsten historischen Tage und liefert deren Outcome-Verteilung.
 * `threshold` (optional) → PoP = Anteil Analoga mit outcome ≥ threshold.
 */
export function queryAnalogs(index: AnalogIndex, query: AnalogQuery, opts: { k?: number; threshold?: number } = {}): AnalogResult {
  const k = opts.k ?? 60;
  const { sd, weights, windowDays } = index; // mu hebt sich in der Differenz auf
  const scored: Array<{ d: AnalogDay; dist: number }> = [];
  for (const d of daysInWindow(index, query.doy, windowDays)) {
    let s = 0;
    for (let j = 0; j < query.predictors.length; j++) {
      const dz = ((query.predictors[j] - d.predictors[j]) / (sd[j] || 1)) * weights[j];
      // mu nicht nötig (Differenz hebt es auf), nur Skalierung über sd.
      s += dz * dz;
    }
    scored.push({ d, dist: Math.sqrt(s) });
  }
  scored.sort((a, b) => a.dist - b.dist);
  const top = scored.slice(0, Math.min(k, scored.length));
  const members = top.map((t) => t.d.outcome);
  const sorted = [...members].sort((a, b) => a - b);
  const pop = opts.threshold != null && members.length
    ? members.filter((m) => m >= (opts.threshold as number)).length / members.length
    : null;
  return {
    members,
    mean: members.length ? members.reduce((s, x) => s + x, 0) / members.length : NaN,
    p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9),
    pop,
    analogs: top.slice(0, 5).map((t) => ({ dateISO: t.d.dateISO, year: t.d.year, distance: Math.round(t.dist * 100) / 100, outcome: t.d.outcome })),
    pool: scored.length,
  };
}

// --- Klimatologie-Baseline (unbedingt, nur Saisonfenster) -------------------

export interface AnalogSkill {
  crpsAnalog: number;
  crpsClim: number;
  /** Verbesserung gegenüber der unbedingten Saison-Klimatologie (%). */
  improvementPct: number;
  /** 80-%-Intervall-Abdeckung (Soll ~0,8 = kalibriert). */
  coverage80: number;
  nTest: number;
}

/**
 * Leave-one-year-out: vergleicht das prädiktor-bedingte Analog-Ensemble gegen
 * die unbedingte Saison-Klimatologie (gleiches Fenster, ALLE Tage). Zeigt, ob
 * die Prädiktoren echten Mehrwert über die reine Klimatologie tragen (CRPS).
 */
export function crossValidateAnalog(days: AnalogDay[], opts: { k?: number; windowDays?: number; weights?: number[]; maxFolds?: number } = {}): AnalogSkill {
  const k = opts.k ?? 60;
  const windowDays = opts.windowDays ?? 15;
  const years = [...new Set(days.map((d) => d.year))].sort((a, b) => a - b);
  const maxFolds = opts.maxFolds ?? 22;
  const step = Math.max(1, Math.ceil(years.length / maxFolds));
  const foldYears = years.filter((_, i) => i % step === 0);

  const ensA: number[][] = [], ensC: number[][] = [], obs: number[] = [];
  let covHit = 0, covN = 0;
  for (const yOut of foldYears) {
    const train = days.filter((d) => d.year !== yOut);
    const index = buildAnalogIndex(train, { weights: opts.weights, windowDays });
    const test = days.filter((d) => d.year === yOut);
    for (const t of test) {
      if (!t.predictors.every(Number.isFinite) || !Number.isFinite(t.outcome)) continue;
      const a = queryAnalogs(index, { doy: t.doy, predictors: t.predictors }, { k });
      if (a.members.length < 5) continue;
      // Klimatologie: dieselbe Fenster-Auswahl, aber OHNE Prädiktor-Distanz.
      // CRPS ist O(m²) → die (große) Klima-Stichprobe auf ~k strided herunterrechnen,
      // sonst friert die LOYO-Schleife bei langen Reihen ein (statistisch unkritisch).
      const climAll = daysInWindow(index, t.doy, windowDays).map((d) => d.outcome);
      const stride = Math.max(1, Math.ceil(climAll.length / k));
      const climMembers = climAll.filter((_, i) => i % stride === 0);
      ensA.push(a.members); ensC.push(climMembers); obs.push(t.outcome);
      covN++; if (t.outcome >= a.p10 && t.outcome <= a.p90) covHit++;
    }
  }
  const crpsAnalog = meanCrps(ensA, obs);
  const crpsClim = meanCrps(ensC, obs);
  return {
    crpsAnalog: round3(crpsAnalog),
    crpsClim: round3(crpsClim),
    improvementPct: crpsClim > 0 ? Math.round((1 - crpsAnalog / crpsClim) * 100) : 0,
    coverage80: covN ? Math.round((covHit / covN) * 100) / 100 : 0,
    nTest: covN,
  };
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface AeCheck { name: string; ok: boolean; detail?: string }
export interface AeVerifyResult { checks: AeCheck[]; passed: number; failed: number }

function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function verifyAnalogEnsemble(): AeVerifyResult {
  const checks: AeCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Synthetik: outcome hängt vom Prädiktor p ab (outcome = 3p + Rauschen),
  // unabhängig von doy. Analog (bedingt auf p) muss die Klimatologie schlagen.
  const rnd = lcg(11);
  const days: AnalogDay[] = [];
  for (let year = 2000; year < 2020; year++) {
    for (let doy = 1; doy <= 365; doy++) {
      const p = (rnd() - 0.5) * 4; // „Vorhersage-Prädiktor"
      const outcome = 3 * p + (rnd() - 0.5) * 2;
      days.push({ doy, year, dateISO: `${year}-${doy}`, predictors: [p], outcome });
    }
  }

  const idx = buildAnalogIndex(days, { windowDays: 20 });

  // 1) Query mit hohem p → hoher Mittelwert; niedriges p → niedriger.
  const hi = queryAnalogs(idx, { doy: 100, predictors: [1.5] }, { k: 80 });
  const lo = queryAnalogs(idx, { doy: 100, predictors: [-1.5] }, { k: 80 });
  add('hoher Prädiktor → höherer Ensemble-Mittelwert', hi.mean > lo.mean + 4, `${lo.mean.toFixed(1)} → ${hi.mean.toFixed(1)}`);
  add('Quantile geordnet', hi.p10 <= hi.p50 && hi.p50 <= hi.p90);
  add('Analoga-Liste gefüllt', hi.analogs.length === 5 && hi.pool > 80);

  // 2) Bedingtes Analog schlägt unbedingte Klimatologie (CRPS) + Kalibrierung.
  const skill = crossValidateAnalog(days, { k: 60, windowDays: 20 });
  add('CRPS: Analog < Klimatologie', skill.crpsAnalog < skill.crpsClim, `${skill.crpsAnalog} < ${skill.crpsClim}`);
  add('deutliche Verbesserung (>20%)', skill.improvementPct > 20, `${skill.improvementPct}%`);
  add('80-%-Abdeckung kalibriert (0,7–0,9)', skill.coverage80 >= 0.7 && skill.coverage80 <= 0.92, `${skill.coverage80}`);

  // 3) PoP-Schwelle.
  const wet = queryAnalogs(idx, { doy: 200, predictors: [1.0] }, { k: 80, threshold: 0 });
  add('PoP in [0,1]', wet.pop != null && wet.pop >= 0 && wet.pop <= 1, `${wet.pop}`);

  // 4) Gepflanztes Analog: exakter Prädiktor-Match → Distanz ~0 als nächster.
  const planted: AnalogDay[] = [...days, { doy: 150, year: 1999, dateISO: '1999-PLANT', predictors: [2.345], outcome: 99 }];
  const pidx = buildAnalogIndex(planted, { windowDays: 20 });
  const pr = queryAnalogs(pidx, { doy: 150, predictors: [2.345] }, { k: 5 });
  add('findet gepflanztes Analog als nächstes', pr.analogs[0].dateISO === '1999-PLANT' && pr.analogs[0].distance < 0.05, `${pr.analogs[0].dateISO} d=${pr.analogs[0].distance}`);

  // 5) Saisonfenster respektiert: Query im Sommer zieht keine Winter-Tage.
  const summer = queryAnalogs(idx, { doy: 200, predictors: [0] }, { k: 200 });
  add('Saisonfenster begrenzt Pool', summer.analogs.every((a) => doyDist(Number(a.dateISO.split('-')[1]), 200) <= 20));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAnalogEnsemble: typeof verifyAnalogEnsemble }).__verifyAnalogEnsemble = verifyAnalogEnsemble;
}
