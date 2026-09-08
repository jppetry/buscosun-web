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
