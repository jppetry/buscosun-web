/**
 * WF4 — Farbrampe des Layers „Feuerwetter stündlich" (ISI, Stufe 1).
 *
 * Anders als der RH-Treiber (`drynessRamp`: weicher Sand-Ocker-Verlauf, weil er
 * eine Tendenz zeigt) ist der ISI ein **klassierter** Wert: EFFIS veröffentlicht
 * sechs Klassen mit festen Grenzen (Low < 3,2 · Moderate 3,2–5 · High 5–7,5 ·
 * Very High 7,5–13,4 · Extreme 13,4–26,8 · Very Extreme > 26,8 —
 * `dangerViews.ts`, gemessen an den `GetLegendGraphic`-Bildern). Die Fläche muss
 * dieselben Grenzen zeigen wie die Legende daneben, sonst liest man aus der Karte
 * eine Klasse ab, die die Legende nicht meint.
 *
 * ── Warum harte Kanten, und wie sie entstehen ────────────────────────────────
 * `getColorRamp` (`wind/glUtil.ts:252`) baut aus dem Stop-Objekt einen
 * Canvas-`LinearGradient`. Zwei Stops auf **derselben** Position ergeben dort
 * einen Sprung statt eines Verlaufs — deshalb steht jede Klassengrenze zweimal
 * darin: einmal mit der Farbe der unteren, einmal mit der der oberen Klasse.
 * Der minimale Versatz `EPS` ist nötig, weil ein Record numerische Schlüssel
 * dedupliziert (zweimal `0.1067` wäre ein Eintrag, nicht zwei).
 *
 * Die Positionen sind **ISI / ISI_VMAX** — genau die Normierung, mit der der
 * Producer den R-Kanal füllt (`iconD2FireWeather.ts`: `R = value/vMax`, `vMax`
 * = `ISI_VMAX` = 30). Ein zweiter, frei gewählter Bezug wäre eine stille
 * Verschiebung der Klassengrenzen gegenüber der Legende.
 *
 * Die Farbfolge ist die der Gefahrenklassen (`FireLayerCard.DANGER_STEPS` /
 * `fireModel`-Stufenfarben) — dieselbe Reihe, damit „rot" in beiden Flächen
 * dasselbe Gewicht hat; sie ist unsere Wahl und nicht amtlich (`colorOrigin:
 * 'derived'`, s. `fireModel.ts`).
 *
 * Pur: kein DOM, kein Fetch. `verify:fire-model` ruft `verifyIsiRamp()`.
 */

import { ISI_VMAX } from '../../sources/iconD2FireWeather';

/**
 * Die fünf EFFIS-Klassengrenzen des ISI in ISI-Einheiten. Wörtlich die Werte
 * aus `dangerViews.ts` (`DANGER_VIEWS.isi.classes`) — dort als Text für die
 * Legende, hier als Zahl für die Fläche. Eine Quelle, zwei Darstellungen.
 */
export const ISI_CLASS_BOUNDS: readonly number[] = [3.2, 5.0, 7.5, 13.4, 26.8];

/**
 * Die sechs Klassenfarben, von „Low" bis „Very Extreme" — dieselbe abgeleitete
 * Reihe wie die Gefahrenstufen (`FIRE_SOURCE_EU.scale`). Die unterste Klasse
 * ist halbtransparent: ein flächendeckendes Grün über ganz DACH wäre eine
 * Einfärbung ohne Aussage, und „Low" heißt genau das.
 */
export const ISI_CLASS_COLORS: readonly string[] = [
  'rgba(143,191,107,0.30)', // Low        < 3,2
  'rgba(214,210,78,0.72)',  // Moderate   3,2–5
  'rgb(233,163,60)',        // High       5–7,5
  'rgb(212,99,46)',         // Very High  7,5–13,4
  'rgb(163,43,30)',         // Extreme    13,4–26,8
  'rgb(107,20,16)',         // Very Extreme > 26,8
];

/** Abstand der beiden Stops einer Kante — klein genug für eine harte Kante,
 *  groß genug, damit die Record-Schlüssel verschieden bleiben. */
const EPS = 1e-4;

/**
 * Baut die Stop-Tabelle für `ScalarLayer.colorRamp`: je Klasse ein konstanter
 * Bereich, an jeder Grenze ein Sprung. Positionen sind `ISI / ISI_VMAX`.
 */
function buildIsiRamp(): Record<number, string> {
  const stops: Record<number, string> = { 0: ISI_CLASS_COLORS[0] };
  ISI_CLASS_BOUNDS.forEach((bound, i) => {
    const at = bound / ISI_VMAX;
    stops[Math.max(0, at - EPS)] = ISI_CLASS_COLORS[i];       // Ende der unteren Klasse
    stops[at] = ISI_CLASS_COLORS[i + 1];                       // Anfang der oberen
  });
  stops[1] = ISI_CLASS_COLORS[ISI_CLASS_COLORS.length - 1];
  return stops;
}

/** Die Rampe des Layers `fireForecast` — sechs EFFIS-Klassen mit harten Kanten. */
export const isiRamp: Record<number, string> = buildIsiRamp();

/** Die Klasse (0..5), in die ein ISI-Wert fällt — für Punktkurve und Texte. */
export function isiClassIndex(isiValue: number): number {
  if (!Number.isFinite(isiValue)) return -1;
  let idx = 0;
  for (const b of ISI_CLASS_BOUNDS) { if (isiValue >= b) idx++; }
  return idx;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei, DOM-frei)
// ---------------------------------------------------------------------------

export interface IsiRampCheck { name: string; ok: boolean; detail?: string }

export function verifyIsiRamp(): { checks: IsiRampCheck[]; passed: number; total: number } {
  const checks: IsiRampCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  add('sechs Klassen, fünf Grenzen — wie die EFFIS-Legende',
    ISI_CLASS_COLORS.length === 6 && ISI_CLASS_BOUNDS.length === 5);
  add('die Grenzen sind die EFFIS-Werte 3,2 / 5 / 7,5 / 13,4 / 26,8',
    ISI_CLASS_BOUNDS.join(',') === '3.2,5,7.5,13.4,26.8', ISI_CLASS_BOUNDS.join(','));
  add('die Grenzen steigen streng',
    ISI_CLASS_BOUNDS.every((b, i) => i === 0 || b > ISI_CLASS_BOUNDS[i - 1]));
  add('alle Grenzen liegen im kodierten Wertebereich (≤ ISI_VMAX)',
    ISI_CLASS_BOUNDS.every((b) => b > 0 && b <= ISI_VMAX), `ISI_VMAX=${ISI_VMAX}`);

  const keys = Object.keys(isiRamp).map(Number).sort((a, b) => a - b);
  add('die Rampe beginnt bei 0 und endet bei 1', keys[0] === 0 && keys[keys.length - 1] === 1);
  add('jede Klassengrenze trägt ZWEI Stops (harte Kante, kein Verlauf)',
    ISI_CLASS_BOUNDS.every((b) => {
      const at = b / ISI_VMAX;
      return isiRamp[at] !== undefined && isiRamp[Math.max(0, at - EPS)] !== undefined
        && isiRamp[at] !== isiRamp[Math.max(0, at - EPS)];
    }));
  add('die Stops liegen bei ISI/ISI_VMAX — dieselbe Normierung wie der R-Kanal des Producers',
    Math.abs((ISI_CLASS_BOUNDS[0] / ISI_VMAX) - 3.2 / 30) < 1e-12
      && isiRamp[ISI_CLASS_BOUNDS[0] / ISI_VMAX] === ISI_CLASS_COLORS[1]);
  add('die unterste Klasse ist halbtransparent (keine Vollfläche ohne Aussage)',
    /rgba\(.*0\.3\d*\)/.test(ISI_CLASS_COLORS[0]), ISI_CLASS_COLORS[0]);
  add('die Farben sind paarweise verschieden', new Set(ISI_CLASS_COLORS).size === 6);

  add('isiClassIndex trifft die Grenzen von unten',
    isiClassIndex(0) === 0 && isiClassIndex(3.19) === 0 && isiClassIndex(3.2) === 1
      && isiClassIndex(26.8) === 5 && isiClassIndex(100) === 5);
  add('isiClassIndex meldet −1 für nicht bestimmbare Werte (nie Klasse 0)',
    isiClassIndex(NaN) === -1);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
