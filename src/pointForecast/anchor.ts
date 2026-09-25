/**
 * Stationsanker als INNOVATIONS-Persistenz (V-PV-19).
 *
 * Der Altpfad trug die Station bisher als WERT in den Blend — Gewicht 5,0,
 * Halbwertszeit 2,5 h (`leadTimeWeights.ts`). Ein Messwert von 06 Uhr galt
 * damit um 09 Uhr noch zu drei Vierteln, mitten im Morgenanstieg. Gemessen an
 * 111 DE-Stationen (V-A₁, `audit/punktvorhersage-14tage/implementierung-pv3.md`
 * §11): 2,03 K MAE bei 1–6 h gegen 0,89 K für das rohe MOSMIX im selben Blend,
 * Bias −0,80 K.
 *
 * Was die Station wirklich weiß, ist nicht die Temperatur der nächsten Stunden,
 * sondern der VERSATZ des Modells an diesem Ort: die Zelle mittelt Tal und Berg,
 * die Station steht im Tal. Dieser Versatz (die Innovation) ist über Stunden
 * stabil, die Temperatur ist es nicht. Also: Modell + Versatz · Abklingen — das
 * Modell trägt den Tagesgang, die Station den Ort. Das erfüllt die Absicht des
 * alten Ankers (der Innsbruck-Kommentar in `leadTimeWeights.ts`) besser als der
 * alte Anker selbst.
 *
 * Schritt zwei: der Versatz kommt nicht nur aus dem letzten 10-Minuten-Wert,
 * sondern aus den Paaren (Messung, Modell) der letzten Stunden, altersgewichtet.
 * Das glättet das Messrauschen und sieht, ob der Anstieg schneller oder
 * langsamer läuft als das Modell sagt. Braucht kein Archiv: BrightSky liefert
 * Messungen und den laufenden MOSMIX-Lauf rückwirkend, GeoSphere die TAWES-
 * Historie in einem Aufruf, MeteoSchweiz den ganzen Tag in der Stationsdatei;
 * AROME/INCA tragen ihre vergangenen Schritte ohnehin.
 *
 * Alle Zahlen hier sind Priors; `verify:pv-score --anchor value|offset` misst
 * beide Fassungen an denselben Stationen. Pur, headless-prüfbar ({@link verifyAnchor}).
 */

export type AnchorMode = 'offset' | 'value';

/** Abklingzeit des Versatzes mit dem Vorlauf (h). Ortsversatz hält länger als Windfehler. */
export const ANCHOR_TAU_H = Object.freeze({ temperature: 4, humidity: 4, wind: 2, gust: 2 });
/** Wie viele vergangene Stunden als Paare (Messung, Modell) eingehen. */
export const ANCHOR_HISTORY_H = 6;
/** Altersgewichtung der Paare: exp(−Alter / τ). */
export const ANCHOR_HISTORY_TAU_H = 3;
/** Plausibilitätsdeckel des Versatzes je Größe (K, %, m/s, m/s). */
export const ANCHOR_MAX = Object.freeze({ temperature: 8, humidity: 40, wind: 6, gust: 8 });

/** Ein Paar aus Messung und Modellwert zur selben Zeit, `wsp` = räumliches Gewicht der Station. */
export interface AnchorPair { ageH: number; obs: number; model: number; wsp: number }

export interface Innovation {
  /** Altersgewichteter Versatz Messung − Modell, gedeckelt. */
  offset: number;
  /** Repräsentativität der Station(en) in [0,1] — eine ferne, höhere Station trägt nur einen Bruchteil. */
  fraction: number;
  pairs: number;
}

/** Versatz aus den Paaren; `null`, wenn keins trägt. */
export function innovation(pairs: AnchorPair[], maxAbs: number): Innovation | null {
  let sw = 0, sd = 0, fr = 0, n = 0;
  for (const p of pairs) {
    if (!Number.isFinite(p.obs) || !Number.isFinite(p.model) || !(p.wsp > 0)) continue;
    const w = p.wsp * Math.exp(-Math.max(0, p.ageH) / ANCHOR_HISTORY_TAU_H);
    if (!(w > 0)) continue;
    sw += w; sd += w * (p.obs - p.model); fr = Math.max(fr, p.wsp); n++;
  }
  if (!n || !(sw > 0)) return null;
  const offset = Math.max(-maxAbs, Math.min(maxAbs, sd / sw));
  return { offset, fraction: Math.min(1, fr), pairs: n };
}

/** Abklingen des Versatzes mit dem Vorlauf. */
export function anchorDecay(leadH: number, tauH: number): number {
  return leadH <= 0 ? 1 : Math.exp(-leadH / tauH);
}

/** Der Zuschlag, der bei Vorlauf `leadH` auf den Modellwert kommt. */
export function anchorTerm(inn: Innovation | null, leadH: number, tauH: number): number {
  return inn ? inn.offset * inn.fraction * anchorDecay(leadH, tauH) : 0;
}

// ---------------------------------------------------------------------------
// V-FL-20 (FL-AP8b): das Gewicht aus der GEMESSENEN Persistenzkurve statt e^(−τ/τ_v)
// ---------------------------------------------------------------------------
//
// Der Fit der Lernphase (`fitAnchor.ts`, `tables.anchor[v].curve`) misst an den Form-K-Residuen derselben
// (Punkt, Slot)-Reihe, wie viel vom Residuum bei Vorlauf 1 bei Vorlauf τ noch da ist: w(τ) = cov(e₁, e_τ)/var(e₁).
// Gemessen (Fit 2, 24.09.2026, T): 0,91 bei 2 h, 0,71 bei 4 h, 0,41 bei 6 h, ≈ 0 bei 9–18 h, 0,45 bei 24–26 h,
// ≈ 0 bei 33–42 h, 0,38 bei 48 h — die Nacht nach der Messung kehrt wieder (Tagesgang); e^(−τ/4) gibt 0,61 · 0,37 ·
// 0,22 · 0,002 und trifft weder die ersten Stunden noch 24 h. Die Kurve wirkt nur hinter `FuseCubeOptions.learned`
// (cubeSource.ts); `anchorDecay`/`anchorTerm` bleiben unverändert (Live-Pfad, Rückfall ohne Kurve).

/**
 * Ein Punkt der Persistenzkurve, wie der Fit sie schreibt: `curve[τ−1]` für τ = 1…48; `weight` = optimales lineares
 * Gewicht von e₁ für e_τ, `null` wo der Fit zu wenig Paare hatte (n < 200); bei τ = 1 per Definition null (Referenz).
 */
export interface AnchorCurvePoint { leadH: number; rho: number | null; weight: number | null; n: number }
/** Länge der Kurve (Vorlauf 1…48 h) — dieselbe Zahl wie `ANCHOR_MAX_LEAD_H` in `fitAnchor.ts` (der Verifier bindet beide). */
export const ANCHOR_CURVE_LEAD_H = 48;

/** Formprüfung (Zulassungsregel des Lesers): 48 Einträge, `leadH` 1…48 in Reihe, Gewichte endlich oder `null`. */
export function anchorCurveValid(curve: unknown): curve is AnchorCurvePoint[] {
  if (!Array.isArray(curve) || curve.length !== ANCHOR_CURVE_LEAD_H) return false;
  for (let i = 0; i < curve.length; i++) {
    const c = curve[i] as Partial<AnchorCurvePoint> | null;
    if (!c || typeof c !== 'object' || c.leadH !== i + 1) return false;
    if (!(c.weight === null || (typeof c.weight === 'number' && Number.isFinite(c.weight)))) return false;
  }
  return true;
}

/**
 * Gewicht des Versatzes bei Vorlauf `leadH` aus der Kurve: τ ≤ 1 ⇒ 1 (Definition: e₁ gegen sich selbst); 2…48 ⇒ der
 * gemessene Eintrag; bei gebrochenem Vorlauf oder fehlendem Eintrag linear zwischen den nächsten endlichen Einträgen
 * (nach unten bis zur Definition bei 1 h); jenseits des letzten gemessenen Vorlaufs ⇒ 0 — das ist die DATENLAGE (der
 * Fit endet bei 48 h, ρ_T(48) ≈ 0,29 fällt weg; offen), keine Aussage über die Persistenz. Negative Gewichte sind
 * Daten (Gegenphase des Tagesgangs), nur auf [−1, 1] gedeckelt. `null`, wenn die Kurve die Form nicht hat — dann
 * gilt die Setzung (`anchorTerm`).
 */
export function anchorWeightFromCurve(curve: unknown, leadH: number): number | null {
  if (!anchorCurveValid(curve) || !Number.isFinite(leadH)) return null;
  if (leadH <= 1) return 1;
  const clamp = (w: number) => Math.max(-1, Math.min(1, w));
  let last = 0;
  for (let i = curve.length - 1; i >= 0; i--) if (curve[i].weight != null) { last = curve[i].leadH; break; }
  if (leadH > last) return 0;
  const at = (L: number): number | null => (L <= 1 ? 1 : (curve[L - 1]?.weight ?? null));
  const lo = Math.floor(leadH), hi = Math.ceil(leadH);
  if (lo === hi) { const w = at(lo); if (w != null) return clamp(w); }
  let L0 = lo, L1 = hi === lo ? lo + 1 : hi;
  while (at(L0) == null) L0 -= 1;
  while (at(L1) == null) L1 += 1;
  const w0 = at(L0) as number, w1 = at(L1) as number;
  return clamp(w0 + ((leadH - L0) / (L1 - L0)) * (w1 - w0));
}

/**
 * Der Zuschlag bei Vorlauf `leadH` mit dem Gewicht der Kurve: offset · fraction · w(τ). Der Aufrufer prüft die Kurve
 * vorher (`anchorCurveValid`) und nimmt sonst `anchorTerm`; eine ungültige Kurve gibt hier 0 (kein stiller Rückfall
 * auf eine Setzung, die der Aufrufer nicht benannt hat).
 */
export function anchorTermLearned(inn: Innovation | null, leadH: number, curve: AnchorCurvePoint[]): number {
  if (!inn) return 0;
  const w = anchorWeightFromCurve(curve, leadH);
  return w == null ? 0 : inn.offset * inn.fraction * w;
}

// ---------------------------------------------------------------------------
// Verifikation
// ---------------------------------------------------------------------------

export interface AnchorCheck { name: string; ok: boolean; detail?: string }
export interface AnchorVerifyResult { checks: AnchorCheck[]; passed: number; failed: number }

export function verifyAnchor(): AnchorVerifyResult {
  const checks: AnchorCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // Ein Paar, ko-lokalisiert: der Versatz ist die Differenz, voll gewichtet.
  const one = innovation([{ ageH: 0, obs: 8, model: 12, wsp: 1 }], ANCHOR_MAX.temperature)!;
  add('ein Paar: Versatz = Messung − Modell', near(one.offset, -4, 1e-12) && one.fraction === 1, `${one.offset}`);

  // Zwei Paare: das ältere zählt mit e^(−3/3) — Versatz liegt dazwischen, näher am jungen.
  const two = innovation([{ ageH: 0, obs: 10, model: 8, wsp: 1 }, { ageH: 3, obs: 10, model: 10, wsp: 1 }], 8)!;
  const expect = (2 * 1 + 0 * Math.exp(-1)) / (1 + Math.exp(-1));
  add('Historie: altersgewichteter Versatz', near(two.offset, expect, 1e-12) && two.pairs === 2, `${two.offset.toFixed(4)} vs ${expect.toFixed(4)}`);

  // Ferne Station: Bruchteil, nicht voll.
  const far = innovation([{ ageH: 0, obs: 8, model: 12, wsp: 0.3 }], 8)!;
  add('ferne Station trägt nur ihren Bruchteil', near(anchorTerm(far, 1, 4), -4 * 0.3 * Math.exp(-0.25), 1e-12));

  // Deckel.
  const big = innovation([{ ageH: 0, obs: 30, model: 0, wsp: 1 }], ANCHOR_MAX.temperature)!;
  add('Versatz ist gedeckelt', big.offset === ANCHOR_MAX.temperature);

  // Abklingen: nach τ Stunden bleibt 1/e; bei h = 0 der volle Versatz.
  add('Abklingen: h = τ ⇒ 1/e, h = 0 ⇒ 1', near(anchorDecay(4, 4), Math.exp(-1), 1e-12) && anchorDecay(0, 4) === 1);
  add('kein Anker ⇒ kein Zuschlag', anchorTerm(null, 1, 4) === 0);

  // NEGATIVKONTROLLE: der alte Anker (Wertpersistenz) hätte im Morgenanstieg den
  // Wert festgehalten. Modell steigt 8 → 12 in 3 h, Station misst 8 bei t₀ und
  // liegt exakt auf dem Modell (Versatz 0). Neuer Anker: 12 bleibt 12. Alter
  // Anker (Wert 8 mit ~75 % Gewicht): ≈ 9. Der Unterschied MUSS sichtbar sein.
  const zero = innovation([{ ageH: 0, obs: 8, model: 8, wsp: 1 }], 8)!;
  const newAnchor = 12 + anchorTerm(zero, 3, ANCHOR_TAU_H.temperature);
  const oldAnchor = 0.75 * 8 + 0.25 * 12;
  add('Negativkontrolle: Versatz 0 lässt den Tagesgang unangetastet (alt: −3 K)',
    near(newAnchor, 12, 1e-12) && oldAnchor < 9.5, `neu ${newAnchor} · alt ${oldAnchor}`);

  // NaN-feindlich.
  add('NaN/leere Paare ⇒ null', innovation([{ ageH: 0, obs: NaN, model: 1, wsp: 1 }], 8) === null && innovation([], 8) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAnchor: typeof verifyAnchor }).__verifyAnchor = verifyAnchor;
}
