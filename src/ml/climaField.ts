/**
 * Runtime-Sampler für das gebündelte DACH-Klima-Grid (`public/climaGrid.json`,
 * erzeugt von `_buildClimaGrid.ts`). Liefert für jede Karten-Zelle die
 * klimatologische Referenz (Mittel/Streuung/Nassrate) — die Basis, gegen die das
 * {@link confidenceField} die Live-Vorhersage auf Plausibilität prüft.
 *
 * Stationsdaten (nicht-gitterförmig) → k-NN-IDW über die 3 nächsten Stationen,
 * jede HÖHENKORRIGIERT auf die Zellhöhe (Standard-Lapse 6,5 °C/km). So passt die
 * Klimatologie zur höhenkorrigierten ICON-D2-Temperaturkarte, auch wenn die
 * nächste Station 1500 m tiefer im Tal liegt.
 *
 * Reines Rechnen über bereits geladene Koeffizienten — kein Netzwerk außer dem
 * einmaligen JSON-Load. Headless prüfbar ({@link verifyClimaField}).
 */

import { evalHarmonic } from './climatology';
import type { ClimaCell } from './confidenceField';

export interface ClimaStation {
  id: string; name: string; lat: number; lon: number; elev: number | null;
  /** Fourier-Koeffizienten: Temp-Mittel (tc), Temp-Std (sc), Nassrate (wc). */
  tc: number[]; sc: number[]; wc: number[];
  /** Tagesgang-Harmonische: tmin (tnc) / tmax (txc) je doy — für die erwartete
   *  Stunden-Temperatur. Leer, wenn die Station zu wenige tmin/tmax-Tage hatte. */
  tnc?: number[]; txc?: number[];
  /** Gelernte Regen/Schnee-Übergangstemperatur T50 (°C, ML #2) — null/fehlend,
   *  wenn zu wenige Schneetage für eine belastbare Kurve. */
  t50?: number | null;
  /** Jahres-Basis-Nassrate (Boden gegen „0 %"). */
  base: number;
  n: number;
}

export interface ClimaGridMeta {
  source: string; region: string; years: [number, number];
  binDeg: number; K: number; tau: number; lapsePerM: number; stationCount: number;
}

export interface ClimaGrid { meta: ClimaGridMeta; stations: ClimaStation[] }

export interface ClimaSample {
  /** Höhenkorrigiertes Temperatur-Mittel (°C) für die Zelle am Tag. */
  tempMean: number;
  /** Klimatologische Temperatur-Streuung (°C, ≥ 0,5). */
  tempStd: number;
  /** Klimatologische Regenwahrscheinlichkeit (0..1). */
  wetProb: number;
  /** Tagesgang-Halbamplitude (°C) = (tmax−tmin)/2 am Tag — 0, wenn unbekannt.
   *  Erwartete Stunden-Temperatur: `tempMean + diurnalAmp·cos(2π(h−15)/24)`. */
  diurnalAmp: number;
  /** Distanz zur NÄCHSTEN Station (km) — Maß für die Belastbarkeit der Referenz. */
  nearestKm: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const DEG2RAD = Math.PI / 180;

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * DEG2RAD, dLon = (bLon - aLon) * DEG2RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * DEG2RAD) * Math.cos(bLat * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Klimatologie einer einzelnen Station am Tag-des-Jahres (vor Höhenkorrektur). */
function stationPredict(s: ClimaStation, doy: number): Omit<ClimaSample, 'nearestKm' | 'diurnalAmp'> {
  const tempMean = evalHarmonic(s.tc, doy);
  const tempStd = Math.max(0.5, evalHarmonic(s.sc, doy));
  const wetProb = clamp01(Math.max(0.2 * s.base, evalHarmonic(s.wc, doy)));
  return { tempMean, tempStd, wetProb };
}

/** Physikalischer Anker der Schneefallgrenze (Trockentemperatur, °C). Die
 *  gelernte ML-#2-T50 wird NUR als relative, gedeckelte Orts-Korrektur darauf
 *  angewandt — denn ihr Absolutniveau ist durch Meteostat-Schneehöhe (≠ Schneefall)
 *  kalt-verzerrt, ihr RELATIVES Orts-Signal aber brauchbar. */
const SNOW_BASE_T50 = 1.0;
const SNOW_MAX_ANOM = 1.5;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export class ClimaField {
  readonly meta: ClimaGridMeta;
  private stations: ClimaStation[];
  private lapse: number;
  /** Median der gelernten T50 (Referenz für die relative Korrektur). null = keine. */
  private t50Median: number | null;

  constructor(grid: ClimaGrid) {
    this.meta = grid.meta;
    this.stations = grid.stations;
    this.lapse = grid.meta.lapsePerM ?? 0.0065;
    const t50s = grid.stations.map((s) => s.t50).filter((v): v is number => v != null && Number.isFinite(v));
    this.t50Median = t50s.length ? median(t50s) : null;
  }

  /** Lädt das gebündelte Grid (Default `${BASE_URL}climaGrid.json`). */
  static async load(url?: string, signal?: AbortSignal): Promise<ClimaField> {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const res = await fetch(url ?? `${base}climaGrid.json`, { signal });
    if (!res.ok) throw new Error(`climaGrid.json: HTTP ${res.status}`);
    return new ClimaField(await res.json() as ClimaGrid);
  }

  get size(): number { return this.stations.length; }

  /**
   * Klimatologische Referenz für eine Zelle. `elevM` (z. B. aus dem hsurf-Kanal
   * der Temperaturkarte) steuert die Höhenkorrektur des Mittels; ohne Höhe wird
   * die nächste Stationshöhe als Bezug genommen (keine Korrektur).
   */
  sample(lat: number, lon: number, doy: number, elevM?: number): ClimaSample {
    // 3 nächste Stationen (kleine Liste → lineare Suche genügt).
    const k = Math.min(3, this.stations.length);
    const near: { s: ClimaStation; d: number }[] = [];
    for (const s of this.stations) {
      const d = haversineKm(lat, lon, s.lat, s.lon);
      if (near.length < k) { near.push({ s, d }); near.sort((a, b) => a.d - b.d); }
      else if (d < near[k - 1].d) { near[k - 1] = { s, d }; near.sort((a, b) => a.d - b.d); }
    }

    const nearestKm = near.length ? near[0].d : Infinity;
    let wSum = 0, tMean = 0, tStd = 0, wet = 0, amp = 0;
    for (const { s, d } of near) {
      const w = 1 / (d * d + 1); // IDW, +1 km² gegen Division durch 0
      const p = stationPredict(s, doy);
      // Höhenkorrektur des Mittels: Zelle tiefer als Station → wärmer.
      const ref = s.elev ?? elevM ?? 0;
      const tm = elevM != null ? p.tempMean - this.lapse * (elevM - ref) : p.tempMean;
      tMean += w * tm; tStd += w * p.tempStd; wet += w * p.wetProb; wSum += w;
      if (s.tnc?.length && s.txc?.length) {
        amp += w * Math.max(0, (evalHarmonic(s.txc, doy) - evalHarmonic(s.tnc, doy)) / 2);
      }
    }
    if (wSum === 0) return { tempMean: NaN, tempStd: NaN, wetProb: NaN, diurnalAmp: 0, nearestKm };
    return { tempMean: tMean / wSum, tempStd: Math.max(0.5, tStd / wSum), wetProb: clamp01(wet / wSum), diurnalAmp: amp / wSum, nearestKm };
  }

  /** Bequemer Adapter auf {@link ClimaCell} für eine Größe. */
  cell(lat: number, lon: number, doy: number, quantity: 'temperature' | 'precipProb', elevM?: number): ClimaCell {
    const s = this.sample(lat, lon, doy, elevM);
    if (quantity === 'temperature') return { mean: s.tempMean, std: s.tempStd };
    // Regenwahrscheinlichkeit: Bernoulli-Streuung √(p(1−p)), Boden 0,1.
    return { mean: s.wetProb, std: Math.max(0.1, Math.sqrt(s.wetProb * (1 - s.wetProb))) };
  }

  /**
   * Regen/Schnee-Übergangstemperatur (°C) für einen Ort — physikalischer Anker
   * {@link SNOW_BASE_T50} plus die gelernte ML-#2-Orts-Korrektur (IDW der nächsten
   * Stationen mit T50, relativ zum Median, auf ±{@link SNOW_MAX_ANOM} gedeckelt).
   * Liefert den Anker, wenn keine belastbare Station in der Nähe ist.
   */
  snowT50(lat: number, lon: number): number {
    if (this.t50Median == null) return SNOW_BASE_T50;
    const k = 3;
    const near: { t50: number; d: number }[] = [];
    for (const s of this.stations) {
      if (s.t50 == null) continue;
      const d = haversineKm(lat, lon, s.lat, s.lon);
      if (near.length < k) { near.push({ t50: s.t50, d }); near.sort((a, b) => a.d - b.d); }
      else if (d < near[k - 1].d) { near[k - 1] = { t50: s.t50, d }; near.sort((a, b) => a.d - b.d); }
    }
    if (near.length === 0) return SNOW_BASE_T50;
    let wSum = 0, aSum = 0;
    for (const { t50, d } of near) { const w = 1 / (d * d + 1); aSum += w * (t50 - this.t50Median); wSum += w; }
    const anom = Math.max(-SNOW_MAX_ANOM, Math.min(SNOW_MAX_ANOM, aSum / wSum));
    return SNOW_BASE_T50 + anom;
  }
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface ClfCheck { name: string; ok: boolean; detail?: string }
export interface ClfVerifyResult { checks: ClfCheck[]; passed: number; failed: number }

export function verifyClimaField(): ClfVerifyResult {
  const checks: ClfCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Synthetisches Mini-Grid: zwei Stationen, konstante (DC-only) Koeffizienten.
  // tc=[mean], sc=[std], wc=[wetrate] → evalHarmonic gibt den DC-Term zurück.
  const grid: ClimaGrid = {
    meta: { source: 'test', region: 'T', years: [2000, 2020], binDeg: 1, K: 0, tau: 1, lapsePerM: 0.0065, stationCount: 2 },
    stations: [
      { id: 'A', name: 'Tal', lat: 47.0, lon: 8.0, elev: 400, tc: [5], sc: [4], wc: [0.3], tnc: [-1], txc: [9], t50: 2.5, base: 0.3, n: 9999 },
      { id: 'B', name: 'Fern', lat: 50.0, lon: 12.0, elev: 300, tc: [9], sc: [3], wc: [0.5], t50: 0.5, base: 0.5, n: 9999 },
    ],
  };
  const field = new ClimaField(grid);

  add('size = 2', field.size === 2);

  // Direkt auf Station A (ohne Höhe) → A-Werte.
  {
    const s = field.sample(47.0, 8.0, 100);
    add('an Station A: tempMean ≈ 5', Math.abs(s.tempMean - 5) < 0.2, s.tempMean.toFixed(2));
    add('an Station A: wetProb ≈ 0,3', Math.abs(s.wetProb - 0.3) < 0.02, s.wetProb.toFixed(3));
    add('tempStd ≥ 0,5', s.tempStd >= 0.5);
    add('an Station A: nearestKm ≈ 0', s.nearestKm < 1, s.nearestKm.toFixed(2));
    add('entfernter Punkt: nearestKm groß', field.sample(44.0, 8.0, 100).nearestKm > 200, field.sample(44.0, 8.0, 100).nearestKm.toFixed(0));
    // Tagesgang-Halbamplitude an A: (txc 9 − tnc −1)/2 = 5 (B liegt fern → IDW-Leak ~0).
    add('an Station A: diurnalAmp ≈ 5', Math.abs(s.diurnalAmp - 5) < 0.01, s.diurnalAmp.toFixed(4));
    // An B (ohne tnc/txc) dominiert die 0; A leakt nur verschwindend (fern).
    add('an Station B: diurnalAmp ≈ 0 (kein Tagesgang)', field.sample(50.0, 12.0, 100).diurnalAmp < 0.01, field.sample(50.0, 12.0, 100).diurnalAmp.toFixed(4));
  }

  // snowT50: Physik-Anker (1,0) + relative ML-Korrektur (Median 1,5; A=+2,5 → +2,0, B=+0,5 → 0,0).
  {
    const a = field.snowT50(47.0, 8.0), b = field.snowT50(50.0, 12.0);
    add('snowT50 an A ≈ 2,0 (warm-lehnend)', Math.abs(a - 2.0) < 0.05, a.toFixed(3));
    add('snowT50 an B ≈ 0,0 (kalt-lehnend)', Math.abs(b - 0.0) < 0.05, b.toFixed(3));
    add('snowT50: A wärmer als B', a > b);
    // Ohne jegliche T50 → reiner physikalischer Anker (1,0).
    const noT50 = new ClimaField({ meta: grid.meta, stations: [{ id: 'X', name: 'X', lat: 48, lon: 10, elev: 300, tc: [5], sc: [4], wc: [0.3], base: 0.3, n: 9999 }] });
    add('ohne T50 → physikalischer Anker 1,0', Math.abs(noT50.snowT50(48, 10) - 1.0) < 1e-9, noT50.snowT50(48, 10).toFixed(2));
  }

  // Höhenkorrektur: Zelle 1000 m ÜBER Station A → ~6,5 °C kälter.
  {
    const lo = field.sample(47.0, 8.0, 100, 400);   // auf Station-Höhe
    const hi = field.sample(47.0, 8.0, 100, 1400);  // 1000 m höher
    add('höher → kälter (~6,5 °C)', Math.abs((lo.tempMean - hi.tempMean) - 6.5) < 0.4, `${(lo.tempMean - hi.tempMean).toFixed(2)}`);
  }

  // Räumliche Interpolation: Punkt zwischen A und B liegt zwischen beiden Mitteln.
  {
    const mid = field.sample(48.5, 10.0, 100);
    add('Mitte zwischen A(5) und B(9)', mid.tempMean > 5 && mid.tempMean < 9, mid.tempMean.toFixed(2));
  }

  // cell()-Adapter: precipProb liefert Bernoulli-Std.
  {
    const c = field.cell(47.0, 8.0, 100, 'precipProb');
    add('precipProb mean ≈ 0,3', Math.abs(c.mean - 0.3) < 0.02, c.mean.toFixed(3));
    add('precipProb std = √(p(1−p))', Math.abs(c.std - Math.sqrt(0.3 * 0.7)) < 0.02, c.std.toFixed(3));
    const t = field.cell(47.0, 8.0, 100, 'temperature');
    add('temperature cell mean ≈ 5', Math.abs(t.mean - 5) < 0.2);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyClimaField: typeof verifyClimaField }).__verifyClimaField = verifyClimaField;
}
