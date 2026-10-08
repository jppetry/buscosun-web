/**
 * Phase NS (`audit/niederschlagssummen.md` §3, §9.4): Summe des Radar-Nowcasts eines Landes über (fromMs, toMs] im
 * Quellgitter — für die Karte „Erwartet" 0–2 h (DE RADOLAN-RV 5 min, AT INCA 15 min; CH rzc hat keinen Nowcast).
 *
 * Ein Frame mit Gültigkeit t steht für das Intervall (t − Schritt, t] (dieselbe Regel wie das Stundenmittel von
 * buscosun Fusion 8, `m<lead>.png`); Teilstücke an den Rändern anteilig. Die Frames sind u8 linear bis `vmax` (20 mm/h):
 *   · ein Byte 255 ist gesättigt ⇒ die Summe der Zelle ist eine UNTERGRENZE — gezählt in `sat`, die Karte sagt „mindestens";
 *   · unter 1/255 · vmax (≈ 0,08 mm/h) steht 0 — Nieseln fällt heraus (benannt in der Legende).
 * Reicht der Nowcast nicht bis `toMs`, endet die Summe bei `coveredToMs` (die Karte setzt dahinter das Kartenfeld an).
 *
 * Rein (kein DOM, kein Netz).
 */

const H = 3_600_000;

export interface SumFrame { values: Uint8Array; width: number; height: number; timeMs: number; measured: boolean }

export interface RadarWindowSum {
  width: number;
  height: number;
  /** mm je Zelle über (fromMs, coveredToMs]. */
  mm: Float32Array;
  /** Zahl der gesättigten Frames je Zelle (≥ 1 ⇒ „mindestens"). */
  sat: Uint8Array;
  fromMs: number;
  /** Bis hierhin trägt der Nowcast lückenlos. */
  coveredToMs: number;
  frames: number;
  stepMin: number;
}

/**
 * Summe der NICHT gemessenen Frames (Nowcast) über (fromMs, toMs]. `null`, wenn kein Frame in das Fenster fällt oder die
 * Frames zwischen `fromMs` und dem ersten Frame eine Lücke lassen.
 */
export function radarWindowSum(frames: readonly SumFrame[], fromMs: number, toMs: number, stepMin: number, vmax: number): RadarWindowSum | null {
  const step = stepMin * 60_000;
  const fut = frames.filter((f) => f.timeMs > fromMs && f.timeMs - step < toMs).sort((a, b) => a.timeMs - b.timeMs);
  if (!fut.length) return null;
  const { width, height } = fut[0];
  if (fut.some((f) => f.width !== width || f.height !== height)) return null;
  // Lückenlos ab fromMs: der erste Frame muss fromMs abdecken, jeder weitere an den vorigen anschließen.
  if (fut[0].timeMs - step > fromMs + 1000) return null;
  let coveredToMs = fromMs;
  const use: Array<{ f: SumFrame; w: number }> = [];
  for (const f of fut) {
    const a = Math.max(fromMs, f.timeMs - step), b = Math.min(toMs, f.timeMs);
    if (a > coveredToMs + 1000) break;
    if (b <= a) continue;
    use.push({ f, w: (b - a) / H });
    coveredToMs = Math.max(coveredToMs, b);
  }
  if (!use.length) return null;
  const n = width * height;
  const mm = new Float32Array(n);
  const sat = new Uint8Array(n);
  const k = vmax / 255;
  for (const { f, w } of use) {
    const v = f.values, kw = k * w;
    for (let i = 0; i < n; i++) {
      const b = v[i];
      if (b === 0) continue;
      mm[i] += b * kw;
      if (b === 255 && sat[i] < 255) sat[i]++;
    }
  }
  return { width, height, mm, sat, fromMs, coveredToMs, frames: use.length, stepMin };
}
