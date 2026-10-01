/**
 * confidenceClasses.ts — the word classes of the confidence score of buscosun Fusion (E-KF-3, audit/fusion-konfidenz.md §6/§8).
 *
 * The score (`uncertainty.ts` `confidenceOf`, 0…1, NOT a probability) is turned into one of five words per variable. The
 * thresholds are the score percentiles P20/P40/P60/P80 measured on the archive (16.–28.09.2026, 7 issue days, 389 station
 * points, mode S, chain of stage `fs` with the tables of buscosun Fusion 6 after E-KF-2; `audit/fusion-konfidenz/classes.json`,
 * built by `conf-monotonie.mjs`). A RELATIVE rating: each word covers a fifth of the archive hours of its variable; what the word
 * means is the measured mean |p50 − y| (`mae`) and CRPS of its class, in the unit of the variable — the dashboard shows the mae
 * as "typisch ±0,8 °C" (E-KF-4). Provenance `archive`; the dashboard template's numbers (0,9/0,7/0,5) are gone.
 *
 * No imports: this module is read by the dashboard chunk, the point panel and the bands tab without pulling the motor in.
 */

export type ConfWord = 'sehr unsicher' | 'unsicher' | 'mäßig' | 'solide' | 'hoch';
export type ConfClassVar = 't2m' | 'td2m' | 'wind' | 'gust' | 'clct';

export const CONF_WORDS: readonly ConfWord[] = Object.freeze(['sehr unsicher', 'unsicher', 'mäßig', 'solide', 'hoch']);

export interface ConfClassEntry {
  /** Score thresholds P20/P40/P60/P80 — the word index is the count of thresholds ≤ score. */
  thresholds: readonly [number, number, number, number];
  /** Mean |p50 − y| per class (index = word index), unit of the variable. */
  mae: readonly [number, number, number, number, number];
  /** Mean CRPS per class, unit of the variable. */
  crps: readonly [number, number, number, number, number];
  unit: '°C' | 'm/s' | '%';
}

export const CONF_CLASSES = Object.freeze({
  provenance: 'archive' as const,
  builtAt: '2026-09-30T19:47:45Z',
  archive: 'buscosun-archiv 2026-09-16 … 2026-09-28, jeder 2. Slot (7 Ausgabetage), 389 Stationspunkte, Modus S, 755 463 Zeilen',
  tables: { learned: '1ee84cab689e', stack: '8c5c81adf2fe' },
  byVar: {
    t2m:  { thresholds: [0.147, 0.287, 0.377, 0.461], mae: [1.749, 1.175, 0.995, 0.934, 0.809], crps: [1.239, 0.849, 0.716, 0.672, 0.587], unit: '°C' },
    td2m: { thresholds: [0.300, 0.408, 0.502, 0.630], mae: [1.836, 1.372, 1.077, 0.975, 0.863], crps: [1.384, 1.028, 0.800, 0.725, 0.632], unit: '°C' },
    wind: { thresholds: [0.370, 0.492, 0.603, 0.681], mae: [0.873, 0.796, 0.783, 0.791, 0.738], crps: [0.634, 0.583, 0.577, 0.587, 0.544], unit: 'm/s' },
    gust: { thresholds: [0.354, 0.478, 0.566, 0.669], mae: [1.418, 1.371, 1.150, 1.129, 0.990], crps: [1.052, 1.011, 0.851, 0.842, 0.727], unit: 'm/s' },
    clct: { thresholds: [0.088, 0.162, 0.225, 0.307], mae: [37.949, 30.584, 24.921, 20.290, 12.915], crps: [23.174, 19.883, 16.911, 14.411, 10.105], unit: '%' },
  } satisfies Record<ConfClassVar, ConfClassEntry>,
});

/** Index 0…4 of the class of `score` for `v` (null without a score). */
export function confidenceClassIndex(v: ConfClassVar, score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  const th = CONF_CLASSES.byVar[v].thresholds;
  let i = 0;
  while (i < th.length && score >= th[i]) i += 1;
  return i;
}

export function confidenceWordOf(v: ConfClassVar, score: number | null | undefined): ConfWord | null {
  const i = confidenceClassIndex(v, score);
  return i == null ? null : CONF_WORDS[i];
}

/** Two display classes for colour: `good` = solide or hoch (the upper two fifths), `fair` otherwise. */
export function confidenceClassOf(v: ConfClassVar, score: number | null | undefined): 'good' | 'fair' {
  const i = confidenceClassIndex(v, score);
  return i != null && i >= 3 ? 'good' : 'fair';
}

/** The measured typical error of the class (mean |p50 − y| on the archive), with its unit. */
export function confidenceTypicalError(v: ConfClassVar, score: number | null | undefined): { value: number; unit: ConfClassEntry['unit'] } | null {
  const i = confidenceClassIndex(v, score);
  if (i == null) return null;
  const e = CONF_CLASSES.byVar[v];
  return { value: e.mae[i], unit: e.unit };
}

/** One line for `calib`/provenance notes. */
export function confidenceClassesNote(): string {
  return `confidenceClasses:${CONF_CLASSES.provenance} — Wörter aus Score-Perzentilen P20/P40/P60/P80 je Größe (${CONF_CLASSES.archive}; gebaut ${CONF_CLASSES.builtAt}); T-Schwellen ${CONF_CLASSES.byVar.t2m.thresholds.map((x) => Math.round(x * 100)).join('/')} %, typischer Fehler je Klasse ${CONF_CLASSES.byVar.t2m.mae.map((x) => x.toFixed(2)).join('/')} K`;
}

/** Self-test for the verifiers: thresholds and errors monotone, every word reachable, edges exact. */
export function verifyConfidenceClasses(): Array<{ name: string; ok: boolean; detail?: string }> {
  const out: Array<{ name: string; ok: boolean; detail?: string }> = [];
  for (const [v, e] of Object.entries(CONF_CLASSES.byVar) as Array<[ConfClassVar, ConfClassEntry]>) {
    const thUp = e.thresholds.every((x, i) => i === 0 || x > e.thresholds[i - 1]);
    // Wind: mäßig/solide liegen innerhalb 0,01 (mae 0,783/0,791, crps 0,577/0,587) — der Score trennt dort kaum (audit/fusion-konfidenz.md §8.2)
    const maeDown = e.mae.every((x, i) => i === 0 || x <= e.mae[i - 1] + 0.011);
    const crpsDown = e.crps.every((x, i) => i === 0 || x <= e.crps[i - 1] + 0.011);
    const outerDown = e.mae[4] < e.mae[0] * 0.9 && e.crps[4] < e.crps[0] * 0.9;
    out.push({ name: `${v}: Schwellen steigen, |Fehler| und CRPS fallen je Klasse (Toleranz 0,01, Wind flach in der Mitte), hoch ≥ 10 % besser als sehr unsicher`, ok: thUp && maeDown && crpsDown && outerDown, detail: `mae ${e.mae.join('/')} · crps ${e.crps.join('/')}` });
    const words = [0, ...e.thresholds.map((x) => x - 1e-9), ...e.thresholds].map((s) => confidenceWordOf(v, s));
    out.push({ name: `${v}: Kanten — knapp unter einer Schwelle das untere Wort, auf der Schwelle das obere; 0 ⇒ „sehr unsicher", 1 ⇒ „hoch"`,
      ok: words[0] === 'sehr unsicher' && words[1] === 'sehr unsicher' && words[2] === 'unsicher' && words[3] === 'mäßig' && words[4] === 'solide'
        && words[5] === 'unsicher' && words[6] === 'mäßig' && words[7] === 'solide' && words[8] === 'hoch' && confidenceWordOf(v, 1) === 'hoch' && confidenceWordOf(v, null) === null,
      detail: words.join(',') });
  }
  out.push({ name: 'good = solide|hoch (T: ab 0,377), fair darunter; typischer Fehler T hoch 0,81 K, sehr unsicher 1,75 K',
    ok: confidenceClassOf('t2m', 0.377) === 'good' && confidenceClassOf('t2m', 0.376) === 'fair' && confidenceClassOf('t2m', null) === 'fair'
      && confidenceTypicalError('t2m', 0.9)?.value === 0.809 && confidenceTypicalError('t2m', 0)?.value === 1.749 && confidenceTypicalError('clct', 0.5)?.unit === '%' });
  return out;
}
