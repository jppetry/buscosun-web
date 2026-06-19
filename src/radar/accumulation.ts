/**
 * Niederschlags-Akkumulation (§3) — „wie viel ist/fällt gefallen" statt
 * Momentanrate. Summiert die vorhandenen Frame-Raster (mm/h · Δt) über ein
 * Fenster zu einer mm-Summe und liefert ein u8-Raster für die RainLayer.
 *
 * Rein & headless prüfbar ({@link verifyAccumulation}). Nutzt nur Daten, die
 * wir ohnehin laden (RADOLAN-RV/INCA-Frames).
 */

const VMAX = 20; // u8/255·VMAX = mm/h

/** Obergrenze der Akkumulations-Normierung (mm) — Default für 0–2 h. */
export const ACCUM_VMAX_MM = 30;

export interface AccumInputFrame {
  values: Uint8Array; // u8 mm/h-Raster, north-up
  /** Versatz von jetzt in Minuten. */
  leadMinutes: number;
}

export interface AccumResult {
  /** u8-Raster: Summe ÷ accumVmax · 255 (für RainLayer). */
  values: Uint8Array;
  width: number;
  height: number;
  /** Maximale Summe im Raster (mm). */
  maxMm: number;
  /** Verwendetes Zeitfenster (Minuten). */
  fromMin: number;
  toMin: number;
}

/**
 * Akkumuliert die Frames im Fenster [fromMin, toMin]. Δt jeder Stufe = halber
 * Abstand zu den Nachbarn (Trapez), damit Randframes nicht überzählen.
 */
export function accumulate(
  frames: AccumInputFrame[],
  width: number,
  height: number,
  fromMin: number,
  toMin: number,
  accumVmax = ACCUM_VMAX_MM,
): AccumResult {
  const sel = frames
    .filter((f) => f.leadMinutes >= fromMin && f.leadMinutes <= toMin)
    .sort((a, b) => a.leadMinutes - b.leadMinutes);
  const mm = new Float32Array(width * height);
  for (let k = 0; k < sel.length; k++) {
    const prevLead = k > 0 ? sel[k - 1].leadMinutes : sel[k].leadMinutes;
    const nextLead = k < sel.length - 1 ? sel[k + 1].leadMinutes : sel[k].leadMinutes;
    const dtMin = (nextLead - prevLead) / 2 || (sel.length === 1 ? (toMin - fromMin) : 5);
    const dtH = dtMin / 60;
    const v = sel[k].values;
    for (let i = 0; i < mm.length; i++) {
      const rate = (v[i] / 255) * VMAX; // mm/h
      if (rate > 0) mm[i] += rate * dtH;
    }
  }
  let maxMm = 0;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < mm.length; i++) {
    if (mm[i] > maxMm) maxMm = mm[i];
    if (mm[i] > 0.05) out[i] = Math.max(1, Math.min(255, Math.round((mm[i] / accumVmax) * 255)));
  }
  return { values: out, width, height, maxMm: Math.round(maxMm * 10) / 10, fromMin, toMin };
}

/** Akkumulations-Palette (sequentiell, sand→blau→violett), gegen accumVmax. */
export const accumRamp: Record<number, string> = {
  0.0:  'rgba(0,0,0,0)',
  0.03: 'rgba(214,234,248,0.55)',
  0.1:  'rgba(133,193,233,0.78)',
  0.25: 'rgba(52,152,219,0.86)',
  0.5:  'rgba(41,128,185,0.90)',
  0.75: 'rgba(108,92,231,0.92)',
  1.0:  'rgba(74,35,140,0.95)',
};

/** Vorgeschlagene Fenster-Presets für den Akkumulations-Toggle. */
export const ACCUM_WINDOWS: Array<{ id: string; label: string; fromMin: number; toMin: number; vmax: number }> = [
  { id: '1h', label: '1 h', fromMin: 0, toMin: 60, vmax: 15 },
  { id: '2h', label: '2 h', fromMin: 0, toMin: 120, vmax: 30 },
  { id: '6h', label: '6 h', fromMin: 0, toMin: 360, vmax: 60 },
];

// ---------------------------------------------------------------------------

export interface AcCheck { name: string; ok: boolean; detail?: string }
export interface AcVerifyResult { checks: AcCheck[]; passed: number; failed: number }

export function verifyAccumulation(): AcVerifyResult {
  const checks: AcCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const W = 4, H = 1;
  // Konstante 12 mm/h über 5 Frames à 5 min (0..20 min) → Δt-Trapez = 5 min je Frame.
  const u8 = Math.round((12 / VMAX) * 255); // ~153
  const frames: AccumInputFrame[] = [0, 5, 10, 15, 20].map((leadMinutes) => ({
    values: new Uint8Array([u8, u8, 0, 0]), leadMinutes,
  }));
  const r = accumulate(frames, W, H, 0, 20, 30);
  // 12 mm/h · (20 min = 1/3 h) = 4 mm an Zelle 0.
  add('Summe ≈ 4 mm bei 12 mm/h über 20 min', Math.abs(r.maxMm - 4) < 0.6, `${r.maxMm} mm`);
  add('trockene Zellen bleiben 0', r.values[2] === 0 && r.values[3] === 0);
  add('nasse Zelle > 0', r.values[0] > 0);
  add('Fenster gespeichert', r.fromMin === 0 && r.toMin === 20);

  // Fenster-Auswahl: nur Frame bei 60 min zählt im 1h-Fenster nicht doppelt.
  const f2: AccumInputFrame[] = [{ values: new Uint8Array([u8]), leadMinutes: 30 }];
  const r2 = accumulate(f2, 1, 1, 0, 60, 15);
  add('Einzelframe im Fenster summiert > 0', r2.maxMm > 0, `${r2.maxMm}`);
  add('Frame außerhalb Fenster ignoriert', accumulate([{ values: new Uint8Array([u8]), leadMinutes: 200 }], 1, 1, 0, 60).maxMm === 0);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAccumulation: typeof verifyAccumulation }).__verifyAccumulation = verifyAccumulation;
}
