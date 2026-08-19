/**
 * **Aktivität eines Brands** — das Unterobjekt `FireRecord.activity`
 * (Phasen AF1/AF2, Gates GAF1/GAF2, `audit/aktivfeuer.md` §4/§5).
 *
 * Komponiert die reinen Module dieses Ordners zu EINEM additiven Feld am
 * `FireRecord`; keine bestehende Zeile der Registry ändert sich. `null`, wo
 * es keine Detektionen gibt (reine EFFIS-Einträge, GWIS-Notbetrieb).
 *
 *   overpasses.ts   Überflüge (10 min je Satellit)              — AF1
 *   intensity.ts    FRP je Überflug, FRE, Tag/Nacht, Pixelbreite — AF1
 *   dynamics.ts     Tendenz, Ausbreitungsrichtung, Windflag      — AF2
 *   observation.ts  Beobachtungsgelegenheit bei „kein Signal"    — AF2
 *   features.ts     Merkmalsatz (versioniert) für die Kalibrierung           — AF3
 *   calibration.ts  log-log-Fit + Prädiktionsintervall (Modell und Schätzung)   — AF4
 *   estimate.ts     Flächenschätzung aus Merkmalsatz + Modell, nie ohne Intervall — AF4
 *
 * Was hier NICHT steht: eine Fläche. Der Konzept-`envelope` ist die Form, die
 * die Registry ohnehin zeichnet (`geometry.kind`), seine Fläche ist
 * `areaHa{kind:'upper-bound'}` — es gibt keine zweite Geometrie (BF3). Keine
 * Biomasse (Jan, 2026-08-18). `areaEst` bleibt `null`, bis ein Kalibriermodell
 * aus der BA-Linie existiert (AF4).
 *
 * Pur, DOM-frei — `npm run verify:fire-activity`.
 */

import type { FirePass } from './overpasses';
import { verifyOverpasses } from './overpasses';
import { intensityOf, verifyIntensity, type Intensity } from './intensity';
import { dynamicsOf, windAgreement, verifyDynamics } from './dynamics';
import { verifyObservation, type Observation } from './observation';
import { verifyFeatures } from './features';
import { verifyCalibration } from './calibration';
import { verifyEstimate, type AreaEstimate } from './estimate';

export type ActivityState = 'growing' | 'stable' | 'declining' | 'no-signal';
export type ObservationQuality = 'confirmed' | 'unobserved';

export interface FireActivity extends Intensity {
  /** Schema-Version — steht in jedem Merkmalsatz (AF3), damit später nachvollziehbar bleibt, was wie gerechnet wurde. */
  version: 1;
  /** Zahl der Überflüge (10 min je Satellit) — dieselbe Zahl wie `FireRecord.overpasses`. */
  passCount: number;
  /** AF2: Tendenz aus dem FRP-Verlauf der letzten Überflüge derselben Tageshälfte; `no-signal` = Feuerzustand der Registry; `null` = zu wenig vergleichbare Überflüge. */
  state: ActivityState | null;
  /** AF2: wie die Tendenz zustande kam bzw. warum sie fehlt. */
  stateNote: string | null;
  /** AF2: nur bei `no-signal` — Überflug hatte Sicht in der Region (`confirmed`) oder nicht beobachtbar (`unobserved`). */
  observation: ObservationQuality | null;
  observationNote: string | null;
  /** AF2: Ausbreitungsrichtung (Grad, wohin) aus der Verschiebung des FRP-Schwerpunkts; `null` unter 3 Überflügen oder unter einer halben Pixelbreite. */
  spreadBearingDeg: number | null;
  spreadDistanceM: number | null;
  /** AF2: Plausibilitätsflag gegen den ICON-D2-Wind — nie eine Korrektur; `null` ohne Wind (Layer aus, Frame > 3 h entfernt) oder ohne Richtung. */
  windAgreement: 'agree' | 'disagree' | null;
  /** AF2: benutzte Windrichtung („kommt aus", Grad) — damit das Flag nachvollziehbar bleibt. */
  windFromDeg: number | null;
  /** AF4: Flächenschätzung mit Intervall (`estimate.ts`) — `null` ohne Kalibriermodell, außerhalb des Kalibrierbereichs, ortsfest oder ohne Detektion. */
  areaEst: AreaEstimate | null;
  /** AF4: warum die Schätzung fehlt (Panel-Text); `null`, wenn eine da ist oder nicht gerechnet wurde. */
  areaEstReason: string | null;
}

export interface ActivityContext {
  /** Feuerzustand der Registry ist `no-signal` ⇒ Tendenz heißt so, und die Beobachtung wird qualifiziert. */
  noSignal: boolean;
  /** Regionale Beobachtungsgelegenheit (`observation.ts`), nur bei `noSignal`; `null` = nicht bestimmt. */
  observation: Observation | null;
  /** ICON-D2-Windrichtung („kommt aus", Grad) am Brandort zur Zeit des jüngsten Überflugs; `null` = kein Wind verfügbar. */
  windFromDeg: number | null;
}

const NO_CONTEXT: ActivityContext = { noSignal: false, observation: null, windFromDeg: null };

/** Aus den Überflügen eines Brands (aufsteigend). AF1: Intensität; AF2: Dynamik + Beobachtung. */
export function activityOf(passes: readonly FirePass[], ctx: ActivityContext = NO_CONTEXT): FireActivity {
  const dyn = dynamicsOf(passes);
  const state: ActivityState | null = ctx.noSignal ? 'no-signal' : dyn.state;
  const before = dyn.state === 'growing' ? 'wachsend' : dyn.state === 'declining' ? 'abklingend' : 'stabil';
  const stateNote = ctx.noSignal
    ? (dyn.state ? `vor dem Signalverlust ${before} (${dyn.stateNote})` : dyn.stateNote)
    : dyn.stateNote;
  return {
    version: 1,
    passCount: passes.length,
    ...intensityOf(passes),
    state,
    stateNote,
    observation: ctx.noSignal && ctx.observation ? ctx.observation.quality : null,
    observationNote: ctx.noSignal && ctx.observation ? ctx.observation.note : null,
    spreadBearingDeg: dyn.spreadBearingDeg,
    spreadDistanceM: dyn.spreadDistanceM,
    windAgreement: windAgreement(dyn.spreadBearingDeg, ctx.windFromDeg),
    windFromDeg: ctx.windFromDeg,
    areaEst: null,
    areaEstReason: null,
  };
}

/** Kurzzeile für die Liste — nur, was belastbar ist; nichts wird erfunden. */
export function activitySummary(a: FireActivity): string | null {
  if (a.frpLastPassMw == null) return null;
  const last = `${a.frpLastPassMw.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW zuletzt`;
  if (a.frpMaxPassMw != null && a.frpMaxPassMw > a.frpLastPassMw) {
    return `${last} (max ${a.frpMaxPassMw.toLocaleString('de-DE', { maximumFractionDigits: 1 })} MW)`;
  }
  return last;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei) — bündelt die Module dieses Ordners
// ---------------------------------------------------------------------------

export interface ActivityCheck { name: string; ok: boolean; detail?: string }

export function verifyFireActivity(): { checks: ActivityCheck[]; passed: number; total: number } {
  const checks: ActivityCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const o = verifyOverpasses(); for (const c of o.checks) checks.push({ ...c, name: `[Überflüge] ${c.name}` });
  const i = verifyIntensity(); for (const c of i.checks) checks.push({ ...c, name: `[Intensität] ${c.name}` });
  const d = verifyDynamics(); for (const c of d.checks) checks.push({ ...c, name: `[Dynamik] ${c.name}` });
  const ob = verifyObservation(); for (const c of ob.checks) checks.push({ ...c, name: `[Beobachtung] ${c.name}` });
  const fe = verifyFeatures(); for (const c of fe.checks) checks.push({ ...c, name: `[Merkmale] ${c.name}` });
  const ca = verifyCalibration(); for (const c of ca.checks) checks.push({ ...c, name: `[Kalibrierung] ${c.name}` });
  const es = verifyEstimate(); for (const c of es.checks) checks.push({ ...c, name: `[Schätzung] ${c.name}` });

  const empty = activityOf([]);
  add('[Aktivität] ohne Überflüge: passCount 0, alles null, Version 1',
    empty.passCount === 0 && empty.frpLastPassMw === null && empty.state === null && empty.version === 1);
  const one: FirePass = {
    key: 'N@1', satellite: 'N', fromMs: 1, toMs: 1, atMs: 1, day: false, pixels: 2, frpPixels: 2,
    sumFrp: 12, maxFrp: 8, lat: 48, lon: 11, meanScanKm: 0.4, pixelAreaHa: 32, bbox: [10.998, 47.998, 11.002, 48.002],
  };
  const a = activityOf([one]);
  add('[Aktivität] ein Überflug: Tendenz/Richtung/Wind null, AF4 areaEst null (nichts wird behauptet)',
    a.state === null && a.observation === null && a.spreadBearingDeg === null && a.windAgreement === null && a.areaEst === null);
  const ns = activityOf([one], { noSignal: true, observation: { quality: 'unobserved', laterPassesSeen: 0, latestSeenMs: null, note: 'x' }, windFromDeg: null });
  add('[Aktivität] Feuerzustand no-signal ⇒ state no-signal + Beobachtungsqualität aus dem Kontext',
    ns.state === 'no-signal' && ns.observation === 'unobserved' && ns.observationNote === 'x');
  add('[Aktivität] ohne no-signal wird keine Beobachtung behauptet',
    activityOf([one], { noSignal: false, observation: { quality: 'confirmed', laterPassesSeen: 2, latestSeenMs: 1, note: 'y' }, windFromDeg: null }).observation === null);
  const three: FirePass[] = [
    { ...one, atMs: 1, fromMs: 1, toMs: 1, sumFrp: 10 },
    { ...one, key: 'N@2', atMs: 2, fromMs: 2, toMs: 2, sumFrp: 10 },
    { ...one, key: 'N@3', atMs: 3, fromMs: 3, toMs: 3, sumFrp: 10, lat: 48, lon: 11.02, bbox: [11.018, 47.998, 11.022, 48.002] },
  ];
  add('[Aktivität] Richtung + Wind aus West ⇒ agree, Windrichtung wird mitgeführt',
    (() => { const w = activityOf(three, { noSignal: false, observation: null, windFromDeg: 270 }); return w.spreadBearingDeg != null && w.windAgreement === 'agree' && w.windFromDeg === 270; })());
  add('[Aktivität] ohne Wind kein Flag (null, nicht disagree)', activityOf(three).windAgreement === null);
  add('[Aktivität] Kurzzeile nennt „zuletzt" und MW, keine Fläche',
    /MW zuletzt/.test(activitySummary(a) ?? '') && !/ha/.test(activitySummary(a) ?? ''));
  add('[Aktivität] Kurzzeile ohne FRP ⇒ null (kein Ersatzwert)',
    activitySummary(activityOf([{ ...one, frpPixels: 0, sumFrp: 0, maxFrp: 0 }])) === null);
  add('[Aktivität] max steht nur, wenn er über „zuletzt" liegt',
    (() => { const b = activityOf([{ ...one, atMs: 1, sumFrp: 40 }, { ...one, key: 'N@2', atMs: 2, fromMs: 2, toMs: 2, sumFrp: 10 }]); return /max 40/.test(activitySummary(b) ?? ''); })());

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
