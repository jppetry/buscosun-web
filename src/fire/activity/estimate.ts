/**
 * **Flächenschätzung** — aus Merkmalsatz + Kalibriermodell (Phase AF4, Gate GAF4).
 *
 * Regeln (Konzept §5.7/§7, Audit §15):
 *   • nie ohne Intervall; nie außerhalb des Prädiktorbereichs des Trainings;
 *   • von den anwendbaren Modellen (FRE nur mit belastbarer FRE; Detektionen immer)
 *     das mit der kleineren Leave-one-out-Streuung — Modell v1 (EFFIS-Archiv 2020–2025)
 *     zeigt: Detektionen (σ_LOO 1,33) schlagen FRE (1,50), das Konzept hatte FRE vorn;
 *   • kein Modell / zu wenige Paare / fremde Schema-Version / ortsfest / ohne
 *     Detektion ⇒ `null` mit Grund — es wird nichts erfunden;
 *   • die Schätzung ist **kein Ersatz für eine Kartierung** — trägt der Eintrag
 *     eine EFFIS-Fläche, steht die daneben, die Schätzung ersetzt sie nicht.
 *
 * Pur, DOM-frei, kein `Date.now()` — `npm run verify:fire-activity` (h).
 */

import type { FireFeatures } from './features';
import { FEATURE_VERSION, MIN_PAIRS_FOR_FIT } from './features';
import { predictInterval, round3s, type AreaModel, type LogLogFit } from './calibration';

export type EstimateMethod = 'fre' | 'det';

export interface AreaEstimate {
  ha: number;
  lowHa: number;
  highHa: number;
  /** z. B. `v1-effis-fre` — Modellversion, Labelquelle, Prädiktor. */
  method: string;
  predictor: EstimateMethod;
  /** Zahl der Paare, aus denen das benutzte Modell stammt. */
  n: number;
  level: number;
  /** Herkunft des Modells — damit die Zeile im Panel ohne das Modellobjekt beschriftet werden kann. */
  modelVersion: number;
  labelSource: AreaModel['labelSource'];
  yearFrom: number | null;
  yearTo: number | null;
}

export interface EstimateResult { estimate: AreaEstimate | null; reason: string | null }

/** Ist das Modell für dieses Schema brauchbar? */
export function modelUsable(m: AreaModel | null | undefined): m is AreaModel {
  return !!m && m.featureVersion === FEATURE_VERSION && (m.models.fre != null || m.models.det != null);
}

const fitUsable = (f: LogLogFit | null): f is LogLogFit => !!f && f.n >= MIN_PAIRS_FOR_FIT;

/** Schätzung mit Intervall oder `null` mit Grund. */
export function estimateArea(f: FireFeatures, model: AreaModel | null | undefined): EstimateResult {
  if (!modelUsable(model)) return { estimate: null, reason: 'kein Kalibriermodell geladen' };
  if (f.featureVersion !== model.featureVersion) return { estimate: null, reason: 'Merkmalsschema passt nicht zum Modell' };
  if (f.suspectedStatic) return { estimate: null, reason: 'überwiegend ortsfeste Detektionen — keine Brandfläche zu schätzen' };
  if (f.nDetections == null || f.nDetections < 1) return { estimate: null, reason: 'keine Detektion im Fenster' };

  const tryFit = (fit: LogLogFit | null, x: number | null, predictor: EstimateMethod): AreaEstimate | null | 'outside' => {
    if (!fitUsable(fit) || x == null || !(x > 0)) return null;
    const p = predictInterval(fit, x);
    if (!p) return 'outside';
    return {
      ha: round3s(p.ha), lowHa: round3s(p.lowHa), highHa: round3s(p.highHa),
      method: `v${model.modelVersion}-${model.labelSource === 'effis-rda' ? 'effis' : 'ba'}-${predictor}`,
      predictor, n: fit.n, level: model.intervalLevel,
      modelVersion: model.modelVersion, labelSource: model.labelSource,
      yearFrom: model.years.length ? Math.min(...model.years) : null, yearTo: model.years.length ? Math.max(...model.years) : null,
    };
  };

  const viaFre = tryFit(model.models.fre, f.freMj, 'fre');
  const viaDet = tryFit(model.models.det, f.nDetections, 'det');
  // Anwendbare Kandidaten nach Leave-one-out-Streuung sortieren (kleinere zuerst; bei Gleichstand FRE zuerst).
  const candidates = [
    viaFre && viaFre !== 'outside' ? { e: viaFre, loo: model.models.fre?.looRmseLn ?? Infinity } : null,
    viaDet && viaDet !== 'outside' ? { e: viaDet, loo: model.models.det?.looRmseLn ?? Infinity } : null,
  ].filter((c): c is { e: AreaEstimate; loo: number } => c != null).sort((a, b) => a.loo - b.loo);
  if (candidates.length > 0) return { estimate: candidates[0].e, reason: null };
  if (viaFre === 'outside' || viaDet === 'outside') {
    return { estimate: null, reason: 'außerhalb des Kalibrierbereichs (Prädiktor größer/kleiner als alle Trainingspaare) — keine Extrapolation' };
  }
  return { estimate: null, reason: `kein Modell mit mindestens ${MIN_PAIRS_FOR_FIT} Paaren für diesen Prädiktor` };
}

/** Text fürs Panel — Punktwert NIE ohne Intervall. */
export function estimateLabel(e: AreaEstimate): string {
  const fmt = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: v < 10 ? 1 : 0 });
  const src = e.labelSource === 'effis-rda' ? 'EFFIS-kalibriert' : 'BA-kalibriert';
  const yrs = e.yearFrom != null && e.yearTo != null ? ` ${e.yearFrom}–${e.yearTo}` : '';
  const pred = e.predictor === 'fre' ? 'aus FRE' : 'aus der Zahl der Detektionen';
  return `≈ ${fmt(e.ha)} ha (${fmt(e.lowHa)}–${fmt(e.highHa)} ha, ${Math.round(e.level * 100)} %) — Modell v${e.modelVersion}, ${src} (${e.n} Paare${yrs}), ${pred}; kein Ersatz für eine Kartierung`;
}

// ---------------------------------------------------------------------------
// Laden + Kill-Switch (Browser) — der einzige Netz-/DOM-Zugriff dieses Ordners
// ---------------------------------------------------------------------------

/**
 * Statische Modelldatei, von Hand gepflegt (`scripts/fire/calibrate.mjs` + Commit).
 * Der Service Worker führt `.json` als „gehashtes Asset" (stale-while-revalidate,
 * `public/sw.js`); die Datei ist aber NICHT gehasht. Deshalb wie bei den
 * Warm-Cron-Manifesten `cache: 'no-store'` (T1-Muster, `iconD2WindSource.ts`):
 * der HTTP-Layer bleibt frisch, ein SW liefert höchstens den vorigen Stand und
 * revalidiert. Zusätzlich gilt: **jede veröffentlichte Neukalibrierung erhöht die
 * Modellversion** und damit den Dateinamen — sonst sieht ein wiederkehrender
 * Besucher stillschweigend Zahlen aus dem alten Modell.
 */
export const AREA_MODEL_URL = '/fire/af/area-estimate-v1.json';

/**
 * Sichtbar per Default (Jan, 2026-08-18); Kill-Switch `?afEst=0` in der URL oder
 * `localStorage.afEst = '0'` — dann wird kein Modell geladen und keine Zeile gezeigt
 * (Fallback = Zustand vor AF4). Ohne `window` (Node) immer aus.
 */
export function areaEstEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('afEst');
    if (q === '0') return false;
    if (q === '1') return true;
    return window.localStorage?.getItem('afEst') !== '0';
  } catch { return true; }
}

let _model: Promise<AreaModel | null> | null = null;
/** Einmal je Sitzung; ein Fehlschlag (404 vor dem ersten Commit, Netz) heißt „kein Modell", nie ein Fehler in der Ansicht. */
export function loadAreaModel(): Promise<AreaModel | null> {
  if (!_model) {
    _model = fetch(AREA_MODEL_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<AreaModel>) : null))
      .then((m) => (modelUsable(m) ? m : null))
      .catch(() => null);
  }
  return _model;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface EstimateCheck { name: string; ok: boolean; detail?: string }

export function verifyEstimate(): { checks: EstimateCheck[]; passed: number; total: number } {
  const checks: EstimateCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  // ln y = ln 0,05 + 0,8·ln x, Grad 1; Leverage-Matrix eines gut besetzten Fits (klein ⇒ Intervall ≈ ±t·σ).
  const fit: LogLogFit = {
    coeffs: [Math.log(0.05), 0.8], degree: 1, n: 60, r2: 0.9, sigma: 0.3,
    xtxInv: [[1 / 60 + Math.log(100) ** 2 / 100, -Math.log(100) / 100], [-Math.log(100) / 100, 1 / 100]],
    xMin: 2, xMax: 5000, tCrit: 1.296, looRmseLn: 0.31, looCoverage: 0.8,
  };
  const model: AreaModel = {
    modelVersion: 1, featureVersion: 1, labelSource: 'effis-rda', intervalLevel: 0.8, trainedAtMs: 0, years: [2020, 2025],
    pairsTotal: 80, pairsEligible: 60, models: { fre: fit, det: { ...fit, xMin: 1, xMax: 500 } }, caveats: [],
  };
  const f: FireFeatures = {
    featureVersion: 1, id: 'fire:x', asOfMs: 0, country: 'DE', lat: 48, lon: 11,
    nDetections: 12, nOverpasses: 3, frpMaxPassMw: 20, frpSumWindowMw: 40, freMj: 100, freSpanH: 6, freMaxGapH: 3,
    durationH: 6, coverageHa: 100, coverageCapped: false, hullKm2: 0.2, sensorFamily: 'VIIRS', daynightMix: 'D',
    meanScanKm: 0.4, landcoverDominant: null, month: 8, confidenceFirms: { high: 0, nominal: 1, low: 0 }, assessment: 'plausibel',
    suspectedStatic: false, activityState: null, effisMappedHa: null, effisId: null,
  };
  const r = estimateArea(f, model);
  add('mit FRE ⇒ FRE-Modell, Punktwert ≈ 0,05·100^0,8 ≈ 2,0 ha mit Intervall', !!r.estimate && r.estimate.predictor === 'fre' && Math.abs(r.estimate.ha - 1.99) < 0.05 && r.estimate.lowHa < r.estimate.ha && r.estimate.highHa > r.estimate.ha, JSON.stringify(r));
  add('method nennt Version, Quelle, Prädiktor', r.estimate?.method === 'v1-effis-fre');
  add('ohne FRE ⇒ Detektionsmodell', estimateArea({ ...f, freMj: null }, model).estimate?.predictor === 'det');
  add('Modellwahl nach kleinerer LOO-Streuung: ist das Detektionsmodell enger, gewinnt es auch mit FRE',
    estimateArea(f, { ...model, models: { fre: { ...fit, looRmseLn: 1.5 }, det: { ...fit, xMin: 1, xMax: 500, looRmseLn: 1.3 } } }).estimate?.predictor === 'det');
  add('FRE außerhalb des Bereichs, Detektionen innerhalb ⇒ Detektionsmodell (kein Extrapolieren)', estimateArea({ ...f, freMj: 1e6 }, model).estimate?.predictor === 'det');
  add('beide außerhalb ⇒ null mit Grund „außerhalb des Kalibrierbereichs"', /außerhalb/.test(estimateArea({ ...f, freMj: 1e6, nDetections: 5000 }, model).reason ?? ''));
  add('ohne Modell ⇒ null mit Grund', estimateArea(f, null).estimate === null && /kein Kalibriermodell/.test(estimateArea(f, null).reason ?? ''));
  add('Modell mit zu wenig Paaren (n < 25) wird nicht benutzt', estimateArea(f, { ...model, models: { fre: { ...fit, n: 10 }, det: { ...fit, n: 10 } } }).estimate === null);
  add('fremde featureVersion ⇒ Modell unbrauchbar', !modelUsable({ ...model, featureVersion: 2 as unknown as 1 }));
  add('ortsfest ⇒ keine Schätzung', /ortsfest/.test(estimateArea({ ...f, suspectedStatic: true }, model).reason ?? ''));
  add('ohne Detektion ⇒ keine Schätzung', estimateArea({ ...f, nDetections: null }, model).estimate === null);
  add('ohne window (Node) ist die Schätzung aus — der Kill-Switch kann nur im Browser an sein', areaEstEnabled() === false || typeof window !== 'undefined');
  const label = r.estimate ? estimateLabel(r.estimate) : '';
  add('Label: Punktwert nie ohne Klammer-Intervall, nennt 80 %, Paare, „kein Ersatz für eine Kartierung"',
    /^≈ [\d,]+ ha \([\d,]+–[\d,]+ ha, 80 %\)/.test(label) && /60 Paare/.test(label) && /kein Ersatz für eine Kartierung/.test(label), label);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
