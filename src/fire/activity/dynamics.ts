/**
 * **Dynamik** — wächst es, ist es stabil, klingt es ab, und wohin bewegt es
 * sich? (Phase AF2, Gate GAF2, `audit/aktivfeuer.md` §5, Konzept §5.5).
 *
 * ── Tendenz (`state`) ────────────────────────────────────────────────────────
 * Aus dem FRP-Verlauf der letzten drei Überflüge **derselben Tageshälfte**
 * (Tag- und Nachtüberflüge haben andere Detektionsschwellen und anderes
 * Feuerverhalten — über die Grenze hinweg zeigt ein Verlauf vor allem
 * Artefakte). Alle Überflüge sind VIIRS (eine Sensorfamilie), also keine
 * zweite Trennung nötig.
 *
 *   growing    ΣFRP steigt um mehr als `STABLE_TOLERANCE` **und** neue
 *              Detektionen liegen am Rand — der jüngste Überflug reicht über die
 *              Bbox aller vorigen hinaus (`GROWTH_MIN_M`). Steigende FRP allein
 *              kann ein Blickwinkeleffekt sein; erst die räumliche Ausdehnung
 *              macht es zum Wachstum (Konzept §5.5).
 *   stable     ΣFRP innerhalb ±30 % des vorigen Überflugs.
 *   declining  ΣFRP fällt über zwei Überflüge (jeweils unter der Toleranz).
 *   no-signal  wird NICHT hier gesetzt — das ist der Feuerzustand der Registry
 *              (`statusOf`), qualifiziert durch `observation.ts`.
 *   null       weniger als zwei vergleichbare Überflüge mit FRP — es wird nichts
 *              behauptet. Für DACH ist das der Regelfall.
 *
 * Nicht dasselbe wie `FireEvent.trend` (`fireEvents.ts`: Zählregel über die
 * Detektionen eines Ereignisses, 1 500 m / 48 h). Beide bleiben, beide heißen
 * anders (Jan, 2026-08-18; V-AF-3).
 *
 * ── Ausbreitungsrichtung (`spreadBearingDeg`) ────────────────────────────────
 * Verschiebung des FRP-gewichteten Schwerpunkts: Mittel der früheren Überflüge
 * → jüngster Überflug, Peilung in Grad („wohin"). Erst ab drei Überflügen und
 * nur, wenn die Verschiebung größer ist als eine halbe Pixelbreite
 * (`SPREAD_MIN_M`) — darunter ist es Gitterrauschen, keine Bewegung.
 *
 * ── Geschwindigkeit (`spreadSpeedMh`) ───────────────────────────────────────
 * Verschiebung geteilt durch die Zeit, über die sie stattfand (FRP-gewichtetes Mittel
 * der früheren Zeitpunkte → jüngster Überflug — dieselben Gewichte wie beim Schwerpunkt).
 * **Das ist NICHT die Geschwindigkeit der Feuerfront.** Es ist die Wanderung eines
 * Schwerpunkts zwischen zwei Momentaufnahmen im Abstand von Stunden: erlischt eine Flanke
 * und entzündet sich eine andere, „bewegt" sich der Schwerpunkt, ohne dass etwas gelaufen
 * wäre. Die Zahl steht deshalb nur zusammen mit ihrer Zeitspanne und heißt in der
 * Oberfläche „Verlagerung", nie „Ausbreitungsgeschwindigkeit".
 *
 * ── Windabgleich (`windAgreement`) ───────────────────────────────────────────
 * Ein Flag, keine Korrektur: liegt die Ausbreitungsrichtung innerhalb
 * `WIND_AGREE_DEG` um die Windrichtung („wohin" = met. Richtung + 180°), gilt
 * `agree`; weicht sie mehr als `WIND_DISAGREE_DEG` ab, `disagree` — dann ist
 * entweder der Schwerpunkt durch einen Detektionsausfall verzerrt oder es sind
 * zwei Feuer. Dazwischen `null`. Der Wind kommt vom Aufrufer (nur wenn ein
 * Frame ±3 h um den Überflug liegt).
 *
 * ⚠️ Seit dem Rückzug von Feuerwetter + Ausbreitung (2026-08-23) lädt die
 * Waldbrandseite KEIN Windgitter mehr — `windAt` bleibt dort undefiniert und
 * das Windflag damit dauerhaft `null` (mit seinem benannten Grund, nie 0).
 * Diese Funktion bleibt unverändert nutzbar, sobald ein Aufrufer wieder Wind liefert.
 *
 * Pur, DOM-frei, ohne `Date.now()` — `npm run verify:fire-activity`.
 */

import type { FirePass } from './overpasses';
import type { ActivityState } from './fireActivity';
import { metersBetween } from '../sources/firmsHotspots';

/** ±30 % — Konzept §9 `stable_tolerance`. */
export const STABLE_TOLERANCE = 0.30;
/** Wie viele jüngste Überflüge (gleiche Tageshälfte) die Tendenz tragen. */
export const TREND_WINDOW = 3;
/** Randwachstum: Bbox des jüngsten Überflugs reicht so weit über die vorigen hinaus. Eine Pixelbreite. */
export const GROWTH_MIN_M = 400;
/** Ausbreitung: erst ab dieser Verschiebung des Schwerpunkts eine Richtung. Eine halbe Pixelbreite. */
export const SPREAD_MIN_M = 200;
export const WIND_AGREE_DEG = 60;
export const WIND_DISAGREE_DEG = 120;

/**
 * BDE-B: worauf die Richtungsaussage steht. Alle drei Zahlen sind Beobachtung, keine
 * Bewertung — die Einordnung („grob"/„belastbar") entsteht erst in der Anzeige, mit
 * ausgesprochener Regel. `meanStepM` ist der mittlere Abstand aufeinanderfolgender
 * Überflug-Schwerpunkte: springt er weit über `spreadDistanceM` hinaus, wandert der
 * Schwerpunkt hin und her, statt sich zu verlagern.
 */
export interface SpreadConfidence {
  /** Überflüge mit FRP, die in die Richtung eingehen. */
  passes: number;
  /** Detektionen (Pixel) in diesen Überflügen. */
  detections: number;
  /** Zeitspanne zwischen erstem und letztem dieser Überflüge. */
  spanMs: number;
  /** Mittlerer Abstand aufeinanderfolgender Schwerpunkte, m; `null` unter zwei Überflügen. */
  meanStepM: number | null;
}

export interface Dynamics {
  state: Exclude<ActivityState, 'no-signal'> | null;
  /** Warum die Tendenz fehlt oder wie sie zustande kam — für den Steckbrief. */
  stateNote: string | null;
  spreadBearingDeg: number | null;
  /** Verschiebung des Schwerpunkts in m (nur wenn eine Richtung ausgegeben wird). */
  spreadDistanceM: number | null;
  /**
   * Zeit, über die diese Verschiebung stattfand: vom FRP-gewichteten Mittel der Zeitpunkte
   * der früheren Überflüge bis zum jüngsten — dieselbe Gewichtung wie beim Schwerpunkt,
   * sonst gehörten Weg und Zeit nicht zusammen.
   */
  spreadSpanMs: number | null;
  /** Verschiebung je Stunde (m/h). KEINE Feuerfrontgeschwindigkeit — s. Modulkopf. */
  spreadSpeedMh: number | null;
  /** Worauf die Richtung steht — auch dann gefüllt, wenn keine Richtung herauskommt. */
  spreadConfidence: SpreadConfidence | null;
}

/** Die jüngsten Überflüge derselben Tageshälfte wie der letzte, mit FRP, aufsteigend. */
export function comparablePasses(passes: readonly FirePass[], window = TREND_WINDOW): FirePass[] {
  const withFrp = passes.filter((p) => p.frpPixels > 0);
  if (withFrp.length === 0) return [];
  const last = withFrp[withFrp.length - 1];
  const same = withFrp.filter((p) => p.day === last.day);
  return same.slice(-window);
}

/** Reicht `cur` über die Vereinigung der Bboxen von `prev` hinaus — um mehr als `minM`? */
export function extendsBeyond(cur: FirePass, prev: readonly FirePass[], minM = GROWTH_MIN_M): boolean {
  if (prev.length === 0) return false;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of prev) { w = Math.min(w, p.bbox[0]); s = Math.min(s, p.bbox[1]); e = Math.max(e, p.bbox[2]); n = Math.max(n, p.bbox[3]); }
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((cur.lat * Math.PI) / 180);
  const dW = (w - cur.bbox[0]) * mPerDegLon;
  const dE = (cur.bbox[2] - e) * mPerDegLon;
  const dS = (s - cur.bbox[1]) * mPerDegLat;
  const dN = (cur.bbox[3] - n) * mPerDegLat;
  return Math.max(dW, dE, dS, dN) > minM;
}

export function dynamicsOf(passes: readonly FirePass[]): Dynamics {
  // Schneller Weg für den DACH-Regelfall (ein Überflug): nichts zu vergleichen.
  if (passes.length < 2) {
    const hasFrp = passes.length === 1 && passes[0].frpPixels > 0;
    return {
      state: null,
      stateNote: hasFrp ? 'nur ein Überflug dieser Tageshälfte mit FRP — kein Verlauf' : 'keine Überflüge mit FRP',
      spreadBearingDeg: null, spreadDistanceM: null, spreadSpanMs: null, spreadSpeedMh: null,
      spreadConfidence: confidenceOf(passes.filter((p) => p.frpPixels > 0)),
    };
  }
  const cmp = comparablePasses(passes);
  let state: Dynamics['state'] = null;
  let stateNote: string | null = null;
  if (cmp.length < 2) {
    stateNote = cmp.length === 0
      ? 'keine Überflüge mit FRP'
      : 'nur ein Überflug dieser Tageshälfte mit FRP — kein Verlauf';
  } else {
    const last = cmp[cmp.length - 1]; const prev = cmp[cmp.length - 2];
    const ratio = prev.sumFrp > 0 ? last.sumFrp / prev.sumFrp : Infinity;
    // Alle Überflüge VOR dem jüngsten (nicht nur die vergleichbaren) tragen die Bbox-Referenz.
    const earlier = passes.filter((p) => p.atMs < last.atMs);
    const spatial = extendsBeyond(last, earlier);
    if (ratio > 1 + STABLE_TOLERANCE && spatial) {
      state = 'growing';
      stateNote = `ΣFRP ${fmtPct(ratio)} gegenüber dem vorigen Überflug derselben Tageshälfte und neue Detektionen am Rand`;
    } else if (ratio > 1 + STABLE_TOLERANCE) {
      state = 'stable';
      stateNote = `ΣFRP ${fmtPct(ratio)}, aber ohne räumliche Ausdehnung — als Blickwinkeleffekt möglich, deshalb nicht „wachsend"`;
    } else if (ratio >= 1 - STABLE_TOLERANCE) {
      state = 'stable';
      stateNote = `ΣFRP innerhalb ±30 % des vorigen Überflugs derselben Tageshälfte (${fmtPct(ratio)})`;
    } else {
      // Fallend — über ZWEI Überflüge, wenn drei da sind; bei zweien reicht der eine Schritt nicht.
      const prev2 = cmp.length >= 3 ? cmp[cmp.length - 3] : null;
      const twice = prev2 ? prev.sumFrp < prev2.sumFrp * (1 - STABLE_TOLERANCE) || last.sumFrp < prev2.sumFrp * (1 - STABLE_TOLERANCE) : false;
      if (twice) {
        state = 'declining';
        stateNote = `ΣFRP fällt über zwei Überflüge derselben Tageshälfte (${fmtPct(ratio)} zuletzt)`;
      } else {
        state = 'stable';
        stateNote = `ΣFRP ${fmtPct(ratio)} — ein einzelner Rückgang; „abklingend" erst über zwei Überflüge`;
      }
    }
  }

  // Ausbreitungsrichtung
  let spreadBearingDeg: number | null = null; let spreadDistanceM: number | null = null;
  let spreadSpanMs: number | null = null; let spreadSpeedMh: number | null = null;
  const withFrp = passes.filter((p) => p.frpPixels > 0);
  const spreadConfidence = confidenceOf(withFrp);
  if (withFrp.length >= 3) {
    const last = withFrp[withFrp.length - 1];
    const earlier = withFrp.slice(0, -1);
    let wLat = 0, wLon = 0, wMs = 0, w = 0;
    for (const p of earlier) { wLat += p.lat * p.sumFrp; wLon += p.lon * p.sumFrp; wMs += p.atMs * p.sumFrp; w += p.sumFrp; }
    if (w > 0) {
      const from = { lat: wLat / w, lon: wLon / w };
      const dist = metersBetween(from, last);
      if (dist > SPREAD_MIN_M) {
        spreadBearingDeg = bearingDeg(from.lat, from.lon, last.lat, last.lon);
        spreadDistanceM = Math.round(dist);
        // Die Zeit zum Weg: gewichtetes Mittel der früheren Zeitpunkte → jüngster Überflug.
        // Dieselben Gewichte wie beim Schwerpunkt — sonst gehörten Zähler und Nenner nicht zusammen.
        const span = last.atMs - wMs / w;
        if (span > 0) {
          spreadSpanMs = Math.round(span);
          spreadSpeedMh = Math.round(dist / (span / 3_600_000));
        }
      }
    }
  }
  return { state, stateNote, spreadBearingDeg, spreadDistanceM, spreadSpanMs, spreadSpeedMh, spreadConfidence };
}

/** Zählwerk zur Richtung — ohne Bewertung; `null`, wenn kein Überflug mit FRP da ist. */
export function confidenceOf(withFrp: readonly FirePass[]): SpreadConfidence | null {
  if (withFrp.length === 0) return null;
  let detections = 0;
  for (const p of withFrp) detections += p.frpPixels;
  let steps = 0; let sum = 0;
  for (let i = 1; i < withFrp.length; i++) { sum += metersBetween(withFrp[i - 1], withFrp[i]); steps++; }
  return {
    passes: withFrp.length,
    detections,
    spanMs: withFrp[withFrp.length - 1].atMs - withFrp[0].atMs,
    meanStepM: steps > 0 ? Math.round(sum / steps) : null,
  };
}

function fmtPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return 'aus 0';
  const pct = Math.round((ratio - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct} %`;
}

/** Peilung von A nach B in Grad (0 = Nord, 90 = Ost), äquirektangulär — für Kilometer ausreichend. */
export function bearingDeg(latA: number, lonA: number, latB: number, lonB: number): number {
  const dx = (lonB - lonA) * Math.cos(((latA + latB) / 2) * Math.PI / 180);
  const dy = latB - latA;
  return Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360);
}

/** Kleinster Winkel zwischen zwei Richtungen (0…180). */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
}

/**
 * Windflag: `windFromDeg` ist die meteorologische Richtung („kommt aus"); das
 * Feuer läuft mit dem Wind, also nach `windFromDeg + 180`.
 */
export function windAgreement(spreadBearingDeg: number | null, windFromDeg: number | null): 'agree' | 'disagree' | null {
  if (spreadBearingDeg == null || windFromDeg == null) return null;
  const downwind = (windFromDeg + 180) % 360;
  const d = angleDiff(spreadBearingDeg, downwind);
  if (d <= WIND_AGREE_DEG) return 'agree';
  if (d >= WIND_DISAGREE_DEG) return 'disagree';
  return null;
}

export const STATE_LABEL: Record<Exclude<ActivityState, 'no-signal'>, string> = {
  growing: 'wachsend', stable: 'stabil', declining: 'abklingend',
};

/** Himmelsrichtung in Worten — für die Zeile. */
export function compassLabel(deg: number): string {
  const names = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface DynamicsCheck { name: string; ok: boolean; detail?: string }

function pass(atMs: number, sumFrp: number, lat = 48, lon = 11, opts: Partial<FirePass> = {}): FirePass {
  const half = 0.002;
  return {
    key: `N@${atMs}`, satellite: 'N', fromMs: atMs, toMs: atMs, atMs, day: true,
    pixels: 2, frpPixels: sumFrp > 0 ? 2 : 0, sumFrp, maxFrp: sumFrp, lat, lon,
    meanScanKm: 0.4, pixelAreaHa: 32, bbox: [lon - half, lat - half, lon + half, lat + half], ...opts,
  };
}

export function verifyDynamics(): { checks: DynamicsCheck[]; passed: number; total: number } {
  const checks: DynamicsCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000; const t0 = Date.UTC(2026, 7, 15, 10, 0);

  add('ohne Überflüge: state null mit Grund', dynamicsOf([]).state === null && dynamicsOf([]).stateNote != null);
  add('ein Überflug: state null („kein Verlauf") — der DACH-Regelfall ist kein Fehler',
    dynamicsOf([pass(t0, 10)]).state === null && /kein Verlauf/.test(dynamicsOf([pass(t0, 10)]).stateNote ?? ''));

  // Stabil: 10 → 12 MW (+20 %) an derselben Stelle.
  add('±30 % ⇒ stabil', dynamicsOf([pass(t0, 10), pass(t0 + 2 * H, 12)]).state === 'stable');
  // FRP +50 %, aber gleiche Stelle ⇒ NICHT wachsend (Blickwinkeleffekt möglich).
  const noSpatial = dynamicsOf([pass(t0, 10), pass(t0 + 2 * H, 15)]);
  add('FRP +50 % ohne räumliche Ausdehnung ⇒ stabil, nicht wachsend (Doppelbedingung)',
    noSpatial.state === 'stable' && /Blickwinkel/.test(noSpatial.stateNote ?? ''), noSpatial.stateNote ?? '');
  // FRP +50 % und Bbox 1 km nach Norden hinaus ⇒ wachsend.
  const grow = dynamicsOf([pass(t0, 10), pass(t0 + 2 * H, 15, 48.009, 11)]);
  add('FRP +50 % UND neue Detektionen 1 km am Rand ⇒ wachsend', grow.state === 'growing', grow.stateNote ?? '');
  // Fallend über zwei Überflüge.
  add('fällt über zwei Überflüge (40 → 20 → 10) ⇒ abklingend',
    dynamicsOf([pass(t0, 40), pass(t0 + 2 * H, 20), pass(t0 + 4 * H, 10)]).state === 'declining');
  add('ein einzelner Rückgang (40 → 20) ⇒ noch stabil („abklingend" erst über zwei)',
    dynamicsOf([pass(t0, 40), pass(t0 + 2 * H, 20)]).state === 'stable');
  // Tageshälfte: Nachtüberflug dazwischen wird nicht mit Tag verglichen.
  const mixed = dynamicsOf([pass(t0, 40), pass(t0 + 12 * H, 5, 48, 11, { day: false, key: 'N@n', satellite: 'N' }), pass(t0 + 24 * H, 38)]);
  add('Tendenz vergleicht nur dieselbe Tageshälfte (Nachtüberflug 5 MW dazwischen stört nicht ⇒ stabil)',
    mixed.state === 'stable', mixed.stateNote ?? '');
  add('Überflüge ohne FRP zählen nicht als Verlauf',
    dynamicsOf([pass(t0, 0), pass(t0 + 2 * H, 0)]).state === null);

  // Ausbreitungsrichtung: drei Überflüge, Schwerpunkt wandert nach Osten.
  const east = dynamicsOf([pass(t0, 10, 48, 11), pass(t0 + 2 * H, 10, 48, 11), pass(t0 + 4 * H, 10, 48, 11.02)]);
  add('Ausbreitungsrichtung: Schwerpunkt wandert ~1,5 km nach Osten ⇒ ~90°',
    east.spreadBearingDeg != null && Math.abs(east.spreadBearingDeg - 90) <= 2 && (east.spreadDistanceM ?? 0) > 1000,
    `${east.spreadBearingDeg}° / ${east.spreadDistanceM} m`);
  add('unter drei Überflügen keine Richtung', dynamicsOf([pass(t0, 10), pass(t0 + 2 * H, 10, 48, 11.02)]).spreadBearingDeg === null);
  add('Verschiebung unter einer halben Pixelbreite ⇒ keine Richtung (Gitterrauschen)',
    dynamicsOf([pass(t0, 10), pass(t0 + 2 * H, 10), pass(t0 + 4 * H, 10, 48.001, 11)]).spreadBearingDeg === null);
  add('Peilung: Norden 0°, Osten 90°, Süden 180°, Westen 270°',
    bearingDeg(48, 11, 49, 11) === 0 && bearingDeg(48, 11, 48, 12) === 90 && bearingDeg(48, 11, 47, 11) === 180 && bearingDeg(48, 11, 48, 10) === 270);
  add('Windflag: Feuer nach Osten, Wind aus West (270°) ⇒ agree', windAgreement(90, 270) === 'agree');
  add('Windflag: Feuer nach Osten, Wind aus Ost (90°) ⇒ disagree', windAgreement(90, 90) === 'disagree');
  add('Windflag: 90° Abweichung ⇒ null (unklar), ohne Wind ⇒ null', windAgreement(90, 180) === null && windAgreement(90, null) === null);
  add('Kompass: 0 N, 45 NO, 90 O, 225 SW', compassLabel(0) === 'N' && compassLabel(45) === 'NO' && compassLabel(90) === 'O' && compassLabel(225) === 'SW');
  add('Konstanten wie im Konzept (±30 %, 3 Überflüge)', STABLE_TOLERANCE === 0.3 && TREND_WINDOW === 3);

  // BDE-B: Geschwindigkeit und Konfidenz.
  // Drei Überflüge (t0, t0+2h, t0+4h), Schwerpunkt der ersten beiden bei t0+1h ⇒ Spanne 3 h.
  add('Verlagerung: Weg und Zeit gehören zusammen (Spanne = gewichtetes Mittel → jüngster Überflug)',
    east.spreadSpanMs === 3 * H && east.spreadSpeedMh != null
    && Math.abs(east.spreadSpeedMh - Math.round((east.spreadDistanceM ?? 0) / 3)) <= 1,
    `${east.spreadSpanMs} ms / ${east.spreadSpeedMh} m/h`);
  add('ohne Richtung auch keine Geschwindigkeit (nie eine Zahl ohne ihre Verschiebung)', (() => {
    const d = dynamicsOf([pass(t0, 10), pass(t0 + 2 * H, 10), pass(t0 + 4 * H, 10, 48.001, 11)]);
    return d.spreadBearingDeg === null && d.spreadSpeedMh === null && d.spreadSpanMs === null;
  })());
  add('Konfidenz zählt Überflüge, Detektionen, Zeitspanne und mittleren Schritt',
    east.spreadConfidence != null && east.spreadConfidence.passes === 3
    && east.spreadConfidence.detections === 6 && east.spreadConfidence.spanMs === 4 * H
    && east.spreadConfidence.meanStepM != null && east.spreadConfidence.meanStepM > 0,
    JSON.stringify(east.spreadConfidence));
  add('Konfidenz gibt es AUCH ohne Richtung — sie erklärt, warum keine da ist', (() => {
    const d = dynamicsOf([pass(t0, 10)]);
    return d.spreadBearingDeg === null && d.spreadConfidence?.passes === 1 && d.spreadConfidence.meanStepM === null;
  })());
  add('ohne Überflug mit FRP keine Konfidenz (null, nicht 0)',
    dynamicsOf([pass(t0, 0), pass(t0 + 2 * H, 0)]).spreadConfidence === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
