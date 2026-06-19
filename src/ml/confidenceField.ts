/**
 * Vertrauens-Feld („Confidence-Schleier") — flächige Ehrlichkeitsschicht über
 * den Karten-Layern, abgeleitet aus ML #1 (Klima-MOS).
 *
 * Für JEDE Rasterzelle wird gefragt: „Wie sehr darf man dieser Vorhersage
 * trauen?" — NICHT als neue Messung, sondern als Interpretation des bereits
 * gerenderten Forecast-Feldes gegen die Orts-Klimatologie. Zwei ehrliche
 * Treiber, beide direkt aus ML #1:
 *
 *  1. **Zeit** — {@link leadWeight} aus dem MOS-Combiner: kurzer Vorlauf →
 *     Modell vertrauenswürdig, langer Vorlauf → Skill zerfällt.
 *  2. **Klimatologische Plausibilität** — wie weit liegt der Live-Forecast der
 *     Zelle (z-Score) in der klimatologischen Verteilung dieses Ortes/Tages?
 *     Nahe am Klimamittel → plausibel; ein extremer Ausreißer weit draußen in
 *     der Vorlaufzeit ist verdächtig → Vertrauen runter. Das ist exakt der
 *     `bandWidenedToClima`-Gedanke aus {@link mosForecast}, nur pro Zelle.
 *
 * Für Wahrscheinlichkeits-Größen (Regenwahrscheinlichkeit) kommt ein dritter,
 * informationstheoretischer Term hinzu: eine Zelle mit p≈0 oder p≈1 ist
 * eindeutig, p≈0,5 heißt „wir wissen es nicht" (maximale Entropie → niedrigste
 * Sicherheit). Genau das soll der Schleier sichtbar machen.
 *
 * Rein & headless prüfbar ({@link verifyConfidenceField}).
 */

import { leadWeight } from './mosModel';

/** Klimatologie einer Zelle für den Zieltag (aus dem groben Klima-Grid). */
export interface ClimaCell {
  /** Klimatologisches Mittel der Größe (Temp °C, oder Basis-Regenrate 0..1). */
  mean: number;
  /** Klimatologische Streuung (Std). Nie 0 — sonst keine z-Skala. */
  std: number;
}

export type ConfidenceKind = 'value' | 'prob';

export interface ConfidenceInput {
  /** Live-Forecast-Wert der Zelle (Temp °C, oder Regenwahrscheinlichkeit 0..1). */
  value: number;
  /** Klimatologie der Zelle für diesen Tag-des-Jahres. */
  clima: ClimaCell;
  /** Vorlauf in Tagen (Slider-Stunde / 24). */
  leadDays: number;
  /** 'prob' aktiviert zusätzlich den Schärfe-/Entropie-Term. Default 'value'. */
  kind?: ConfidenceKind;
}

export interface CellConfidence {
  /** Gesamt-Confidence 0..1 (1 = voll vertrauenswürdig). */
  confidence: number;
  /** Zeit-Term (leadWeight). */
  leadTerm: number;
  /** Klimatologische Plausibilität 0..1. */
  plausTerm: number;
  /** Schärfe-Term 0..1 (nur bei kind='prob' < 1, sonst 1). */
  sharpTerm: number;
  /** Standardisierte Abweichung |value − mean| / std. */
  z: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * z-Skala: bis ~2,5 σ gilt ein Forecast als klimatologisch normal (Plausibilität
 * fällt sanft), darüber zunehmend „ungewöhnlich". Gauß-Glocke statt harter Kante.
 */
const Z_SCALE = 2.5;
/** Restvertrauen einer maximal unscharfen Wahrscheinlichkeitszelle (p≈0,5). */
const SHARP_FLOOR = 0.35;
/** Untergrenze, damit eine Zelle nie auf exakt 0 fällt (Schraffur bleibt lesbar). */
const CONF_FLOOR = 0.03;

/** Binäre Entropie in nats (Maximum ln2 bei p=0,5). */
function binaryEntropy(p: number): number {
  const q = clamp01(p);
  if (q <= 0 || q >= 1) return 0;
  return -q * Math.log(q) - (1 - q) * Math.log(1 - q);
}

/** Confidence einer einzelnen Zelle. */
export function cellConfidence(input: ConfidenceInput): CellConfidence {
  const { value, clima, leadDays } = input;
  const kind = input.kind ?? 'value';

  const leadTerm = leadWeight(leadDays);

  // Klimatologische Plausibilität — NUR für Mess-Größen (Temperatur). Bei
  // Wahrscheinlichkeiten ist die z-Plausibilität ungeeignet (ein solider
  // Regenkern hätte einen großen z gegen die Nassrate ~0,3 und würde fälschlich
  // bestraft); dort trägt der Entropie-Term unten das Signal, und die
  // Klimatologie geht über die extern gebildete PoP (MOS-Blend) ein.
  let z = 0;
  let plausTerm = 1;
  if (kind !== 'prob') {
    const std = clima.std > 1e-6 ? clima.std : 1e-6;
    z = Math.abs(value - clima.mean) / std;
    // Gauß-Plausibilität: z=0 → 1; z=Z_SCALE → ~0,61; z=2·Z_SCALE → ~0,14.
    plausTerm = clamp01(Math.exp(-0.5 * (z / Z_SCALE) * (z / Z_SCALE)));
  }

  let sharpTerm = 1;
  if (kind === 'prob') {
    const sharp = 1 - binaryEntropy(value) / Math.LN2; // p=0,5→0 ; p∈{0,1}→1
    sharpTerm = SHARP_FLOOR + (1 - SHARP_FLOOR) * clamp01(sharp);
  }

  const confidence = Math.max(CONF_FLOOR, clamp01(leadTerm * plausTerm * sharpTerm));
  return { confidence, leadTerm, plausTerm, sharpTerm, z };
}

export interface ConfidenceGridInput {
  /** Forecast-Werte row-major (gleiche Geometrie wie das Klima-Grid). */
  values: ArrayLike<number>;
  /** Klimatologie je Zelle, row-major, gleiche Länge wie `values` (null = keine Daten). */
  clima: ArrayLike<ClimaCell | null | undefined>;
  /** Maske: false → Zelle ohne Daten (NaN-Confidence, Layer überspringt sie). */
  mask?: ArrayLike<boolean>;
  leadDays: number;
  kind?: ConfidenceKind;
}

/**
 * Bildet ein ganzes Forecast-Raster auf ein Confidence-Raster ab. Liefert eine
 * Float32Array gleicher Länge (0..1, oder NaN für maskierte Zellen) — bereit zur
 * Texturkodierung im {@link ConfidenceLayer}.
 */
export function confidenceGrid(input: ConfidenceGridInput): Float32Array {
  const n = input.values.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (input.mask && !input.mask[i]) { out[i] = NaN; continue; }
    const c = input.clima[i];
    if (!c || !Number.isFinite(input.values[i])) { out[i] = NaN; continue; }
    out[i] = cellConfidence({ value: input.values[i], clima: c, leadDays: input.leadDays, kind: input.kind }).confidence;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface CfCheck { name: string; ok: boolean; detail?: string }
export interface CfVerifyResult { checks: CfCheck[]; passed: number; failed: number }

export function verifyConfidenceField(): CfVerifyResult {
  const checks: CfCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const clima: ClimaCell = { mean: 5, std: 4 };

  // Am Klimamittel + kurzer Vorlauf → hohe Sicherheit.
  {
    const c = cellConfidence({ value: 5, clima, leadDays: 0 });
    add('Klimamittel, kurz → plaus ≈ 1', Math.abs(c.plausTerm - 1) < 1e-9, c.plausTerm.toFixed(3));
    add('Klimamittel, kurz → conf hoch', c.confidence > 0.9, c.confidence.toFixed(3));
  }

  // Extremer Ausreißer → Plausibilität sinkt klar.
  {
    const normal = cellConfidence({ value: 7, clima, leadDays: 0 });   // ~0,5 σ
    const extreme = cellConfidence({ value: 25, clima, leadDays: 0 }); // 5 σ
    add('Ausreißer < normal (plaus)', extreme.plausTerm < normal.plausTerm, `${extreme.plausTerm.toFixed(3)} < ${normal.plausTerm.toFixed(3)}`);
    add('5σ-Ausreißer deutlich unsicher', extreme.confidence < 0.25, extreme.confidence.toFixed(3));
    add('z korrekt (5σ)', Math.abs(extreme.z - 5) < 1e-9, extreme.z.toFixed(2));
  }

  // Zeit-Term: ferner Vorlauf senkt das Vertrauen monoton.
  {
    const near = cellConfidence({ value: 5, clima, leadDays: 0 });
    const far = cellConfidence({ value: 5, clima, leadDays: 12 });
    add('ferner Vorlauf < naher (conf)', far.confidence < near.confidence, `${far.confidence.toFixed(3)} < ${near.confidence.toFixed(3)}`);
    add('leadTerm = leadWeight', Math.abs(far.leadTerm - leadWeight(12)) < 1e-9);
  }

  // Wahrscheinlichkeits-Schärfe: p≈0,5 ist am unsichersten, p∈{0,1} am sichersten.
  {
    const pClima: ClimaCell = { mean: 0.3, std: 0.45 }; // Bernoulli-ähnlich
    const half = cellConfidence({ value: 0.5, clima: pClima, leadDays: 0, kind: 'prob' });
    const sure = cellConfidence({ value: 0.95, clima: pClima, leadDays: 0, kind: 'prob' });
    add('p=0,5 Schärfe minimal', half.sharpTerm < sure.sharpTerm, `${half.sharpTerm.toFixed(3)} < ${sure.sharpTerm.toFixed(3)}`);
    add('p=0,5 → sharpTerm = FLOOR', Math.abs(half.sharpTerm - SHARP_FLOOR) < 1e-9, half.sharpTerm.toFixed(3));
    add('value-Kind hat keine Schärfe-Dämpfung', cellConfidence({ value: 5, clima, leadDays: 0 }).sharpTerm === 1);
    // prob: eindeutige PoP (p≈1) ist sicherer als p≈0,5; Klimatologie geht NICHT
    // über die z-Plausibilität ein (solider Regenkern wird nicht bestraft).
    add('prob: conf(p=0,95) > conf(p=0,5)', sure.confidence > half.confidence, `${sure.confidence.toFixed(3)} > ${half.confidence.toFixed(3)}`);
    add('prob: plausTerm neutralisiert (=1)', half.plausTerm === 1 && sure.plausTerm === 1);
    const wetCore = cellConfidence({ value: 1, clima: pClima, leadDays: 0, kind: 'prob' });
    add('prob: solider Regenkern (p=1) zuversichtlich', wetCore.confidence > 0.9, wetCore.confidence.toFixed(3));
  }

  // Wertebereich & Boden.
  {
    const c = cellConfidence({ value: 1000, clima, leadDays: 30 });
    add('conf nie < CONF_FLOOR', c.confidence >= CONF_FLOOR - 1e-12, c.confidence.toFixed(4));
    add('conf in [0,1]', c.confidence >= 0 && c.confidence <= 1);
  }

  // std=0 darf nicht durch NaN/Inf explodieren.
  {
    const c = cellConfidence({ value: 6, clima: { mean: 5, std: 0 }, leadDays: 0 });
    add('std=0 robust (endlich)', Number.isFinite(c.confidence) && Number.isFinite(c.z));
  }

  // Grid-Mapper: Länge erhalten, Maske/NaN respektiert.
  {
    const values = [5, 25, 5];
    const cells: ClimaCell[] = [{ mean: 5, std: 4 }, { mean: 5, std: 4 }, { mean: 5, std: 4 }];
    const mask = [true, true, false];
    const g = confidenceGrid({ values, clima: cells, mask, leadDays: 0 });
    add('Grid-Länge erhalten', g.length === 3, `${g.length}`);
    add('Grid: normal > Ausreißer', g[0] > g[1], `${g[0].toFixed(3)} > ${g[1].toFixed(3)}`);
    add('Grid: maskierte Zelle = NaN', Number.isNaN(g[2]));
    add('Grid: NaN-Wert → NaN', Number.isNaN(confidenceGrid({ values: [NaN], clima: [{ mean: 5, std: 4 }], leadDays: 0 })[0]));
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyConfidenceField: typeof verifyConfidenceField }).__verifyConfidenceField = verifyConfidenceField;
}
