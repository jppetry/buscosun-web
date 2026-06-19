/**
 * 3D-Wetter · Föhn & Talwind (Epic D, US-D1/D3, pur).
 *
 * Föhn-Aggregat nutzt den bestehenden `detectFoehn` (Südwind + kräftig + böig +
 * trocken, lat-gated). Talwind-Umkehr leitet aus dem Tagesgang der Windrichtung
 * im Tal den Umschlagzeitpunkt auf-/abwärts ab (anabatisch ↔ katabatisch).
 */

import { detectFoehn } from '../pointForecast/foehnDetector';
import type { AnchorSurface } from './crossSection';
import type { TimeSample } from './buildCrossSection';

const KMH_TO_MS = 1 / 3.6;

export interface FoehnSummary { present: boolean; score: number; reasons: string[] }

/** Föhn-Einschätzung aus den (zeitaufgelösten) Ankerwerten der Schnittlinie. */
export function estimateFoehn(anchors: AnchorSurface[], lat: number): FoehnSummary {
  if (!anchors.length) return { present: false, score: 0, reasons: [] };
  // Repräsentativ: exponiertester Anker (höchste Lage) — dort greift Föhn zuerst.
  const a = anchors.reduce((x, y) => (y.elevM > x.elevM ? y : x), anchors[0]);
  const res = detectFoehn({
    temperatureC: a.tempC,
    windSpeedMps: a.windKmh * KMH_TO_MS,
    windDirectionDeg: a.windDirDeg,
    gustMps: a.gustKmh * KMH_TO_MS,
    relativeHumidityPct: a.humidityPct,
    lat,
  });
  if (!res) return { present: false, score: 0, reasons: [] };
  return { present: res.isFoehn, score: res.score, reasons: res.reasons };
}

export interface TalwindReversal { tMs: number; toUpValley: boolean }

/**
 * Talwind-Umkehrzeitpunkte (US-D3): Vorzeichenwechsel der Wind-Komponente
 * entlang der Talachse. `upBearingDeg` = Kompassrichtung „taleinwärts/bergauf".
 * Liefert die Zeitpunkte mit Richtung (auf-/abwärts).
 */
export function talwindReversals(hours: TimeSample[], upBearingDeg: number): TalwindReversal[] {
  const along = hours.map((h) => {
    const toDir = (h.windDirDeg + 180) % 360; // wohin der Wind weht
    const d = ((toDir - upBearingDeg) * Math.PI) / 180;
    return h.windKmh * Math.cos(d); // > 0 = taleinwärts/bergauf
  });
  const out: TalwindReversal[] = [];
  for (let i = 1; i < along.length; i++) {
    const prev = along[i - 1], cur = along[i];
    // Echter Vorzeichenwechsel mit etwas Hysterese gegen Rauschen.
    if (prev <= -1 && cur >= 1) out.push({ tMs: hours[i].tMs, toUpValley: true });
    else if (prev >= 1 && cur <= -1) out.push({ tMs: hours[i].tMs, toUpValley: false });
  }
  return out;
}

/** Kompass-Bearing (0..360) von a nach b. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface DynCheck { case: string; ok: boolean; detail: string }

function anchor(over: Partial<AnchorSurface>): AnchorSurface {
  return { distanceM: 0, elevM: 2000, windKmh: 0, windDirDeg: 180, gustKmh: 0, tempC: 5, cloudPct: 0, humidityPct: 50, ...over };
}

export function verifyDynamics(): { checks: DynCheck[]; passed: number; failed: number } {
  const checks: DynCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Föhn: Südwind kräftig böig trocken, im Alpenraum (lat 47) → erkannt.
  const fo = estimateFoehn([anchor({ windKmh: 45, windDirDeg: 180, gustKmh: 75, humidityPct: 20 })], 47.3);
  add('Föhn erkannt (Süd/kräftig/trocken)', fo.present && fo.score >= 0.6, `${fo.score}`);
  add('Föhn nennt Gründe', fo.reasons.length >= 2);

  // Kein Föhn: Nordwind, feucht, schwach.
  const nofo = estimateFoehn([anchor({ windKmh: 8, windDirDeg: 0, gustKmh: 10, humidityPct: 90 })], 47.3);
  add('kein Föhn (Nord/feucht/schwach)', !nofo.present, `${nofo.score}`);

  // Föhn-Geo-Gate: gleiche Bedingungen in Norddeutschland (lat 53) → kein Föhn.
  const north = estimateFoehn([anchor({ windKmh: 45, windDirDeg: 180, gustKmh: 75, humidityPct: 20 })], 53);
  add('Föhn-Geo-Gate Norden', !north.present, `${north.score}`);

  // Talwind-Umkehr: Tagesgang dreht morgens bergauf, abends bergab.
  const mk = (dirs: number[]): TimeSample[] => dirs.map((dd, i) => ({ tMs: i * 3600_000, windKmh: 12, windDirDeg: dd, gustKmh: 16, tempC: 10, cloudPct: 0, humidityPct: 50, cloudLowPct: 0, cloudMidPct: 0, cloudHighPct: 0 }));
  // upBearing = 0 (Norden bergauf). Wind weht aus Süden (dir 180 → toDir 0 = bergauf) tagsüber,
  // aus Norden (dir 0 → toDir 180 = bergab) nachts.
  const series = mk([0, 0, 180, 180, 180, 0, 0]); // dir: nachts Nord → mittags Süd → abends Nord
  const rev = talwindReversals(series, 0);
  add('Talwind: 2 Umkehrungen', rev.length === 2, `${rev.length}`);
  add('Talwind: erst bergauf dann bergab', rev[0]?.toUpValley === true && rev[1]?.toUpValley === false);

  // Bearing-Helfer: West→Ost ≈ 90°.
  add('Bearing West→Ost ≈ 90°', Math.abs(bearingDeg({ lat: 47, lon: 11 }, { lat: 47, lon: 11.2 }) - 90) < 2);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyDynamics: typeof verifyDynamics }).__verifyDynamics = verifyDynamics;
}
