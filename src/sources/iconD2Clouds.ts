/**
 * DWD ICON-D2 — Bewölkungsgrad als Gitter für den Wolken-Layer.
 *
 * Parameter (single-level, %): clct (Gesamt), clcl (tief), clcm (mittel),
 * clch (hoch). 2,2 km / 1 h, Lauf alle 3 h. CC BY 4.0. Hier auf den von der
 * Spec gewünschten Horizont **0–27 h** gekappt.
 *
 * Nutzt den gemeinsamen, **parallelen** ICON-D2-Gitter-Loader aus
 * `iconD2Precip.ts` (reguläres lat-lon GDT 0, simple packing, Worker-Decompress).
 * Bewölkung ist **instantan** (kein Akkumulieren); `decodeGrib2` liefert den
 * Wert bereits in % → `cloudToU8`. Zeile 0 = Süden ⇒ Flip übernimmt der Loader.
 */

import {
  fetchIconD2Grid, resolveLatestRun, fetchStepField, gribCorners,
  type IconD2Precip, type GribField,
} from './iconD2Precip';
import { cloudToU8, type QuadCorners } from '../scalar/RainLayer';

/** Verfügbare Bewölkungs-Parameter. */
export type CloudParam = 'clct' | 'clcl' | 'clcm' | 'clch';

/** ICON-D2-Bewölkungsgrad (instantan, 0–27 h) als Uint8-Werte-Grids. */
export function fetchIconD2Clouds(
  param: CloudParam = 'clct',
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Precip) => void,
): Promise<IconD2Precip> {
  return fetchIconD2Grid(
    param,
    { accumulate: false, toU8: cloudToU8, maxStep: 27 },
    signal,
    onProgress,
  );
}

// ---------------------------------------------------------------------------
// Multi-Layer-Bewölkung (tief/mittel/hoch) für den CloudLayer.
// ---------------------------------------------------------------------------

/** Horizont-Cap (h). 3 Params/Schritt × 1215×746 ist schwer → near-term-fokussiert
 *  (Wolken sind v.a. kurzfristig relevant; jenseits clampt der Slider auf den letzten Frame). */
const CLOUD_MAX_STEP = 12;
/** Parallele Schritte (jeder Schritt holt 3 Felder gleichzeitig). Mehr Schritte
 *  gleichzeitig „in der Luft" → bessere Auslastung der 6 HTTP-Verbindungen. */
const CLOUD_STEP_CONCURRENCY = 4;

export interface CloudStackFrame {
  validAt: Date;
  stepHours: number;
  /** w·h·4 Bytes, north-up. RGBA: R=tief, G=mittel, B=hoch (0..255), A=255. */
  values: Uint8Array;
  width: number;
  height: number;
}

export interface IconD2CloudStack {
  runAt: Date;
  frames: CloudStackFrame[];
  corners: QuadCorners;
}

/** Bedeckungsgrad % → Byte (NaN/außerhalb → 0). Roh (Schwelle/Kontrast macht der Shader). */
function pctU8(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round((v / 100) * 255)));
}

/** Packt tief/mittel/hoch zu einer north-up RGBA-Textur (R=tief, G=mittel, B=hoch). */
function packCloudRGBA(low: GribField, mid: GribField, high: GribField): Omit<CloudStackFrame, 'validAt' | 'stepHours'> {
  const { ni, nj } = low;
  const sameGrid = mid.ni === ni && mid.nj === nj && high.ni === ni && high.nj === nj;
  const out = new Uint8Array(ni * nj * 4);
  for (let j = 0; j < nj; j++) {
    const dstRow = (nj - 1 - j) * ni; // S→N → north-up
    const srcRow = j * ni;
    for (let i = 0; i < ni; i++) {
      const o = (dstRow + i) * 4;
      out[o] = pctU8(low.values[srcRow + i]);
      out[o + 1] = sameGrid ? pctU8(mid.values[srcRow + i]) : 0;
      out[o + 2] = sameGrid ? pctU8(high.values[srcRow + i]) : 0;
      out[o + 3] = 255;
    }
  }
  return { values: out, width: ni, height: nj };
}

/**
 * Lädt tiefe/mittlere/hohe Bewölkung (CLCL/CLCM/CLCH) des jüngsten Laufs und
 * packt sie pro Schritt zu einem RGBA-Frame für den `CloudLayer`. Progressiv:
 * `onProgress` feuert pro fertigem Schritt (naher Horizont sofort nutzbar).
 */
export async function fetchIconD2CloudStack(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2CloudStack) => void,
): Promise<IconD2CloudStack> {
  const { runStr, runAt, steps } = await resolveLatestRun('clcl', signal);
  const wanted = steps.filter((s) => s <= CLOUD_MAX_STEP);

  const frames: CloudStackFrame[] = [];
  let corners: QuadCorners | null = null;

  const loadStep = async (step: number): Promise<void> => {
    try {
      const [low, mid, high] = await Promise.all([
        fetchStepField(runStr, 'clcl', step, signal),
        fetchStepField(runStr, 'clcm', step, signal),
        fetchStepField(runStr, 'clch', step, signal),
      ]);
      if (!corners) corners = gribCorners(low);
      const built = packCloudRGBA(low, mid, high);
      frames.push({ validAt: new Date(runAt.getTime() + step * 3_600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress && corners) onProgress({ runAt, frames: [...frames], corners });
    } catch {
      // Einzelner Schritt/Param fehlt → überspringen.
    }
  };

  // „Jetzt"-Frame (Schritt 0) zuerst und ALLEIN laden → erscheint so schnell wie
  // möglich, ohne mit den übrigen 3·N Fetches um die HTTP-Verbindungen zu
  // konkurrieren (onProgress feuert sofort, der Slider zeigt die aktuelle Lage).
  let ptr = 0;
  if (wanted.length > 0) { await loadStep(wanted[ptr++]); }

  // Restliche Schritte parallel nachladen.
  const workers = Array.from({ length: Math.min(CLOUD_STEP_CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (!corners || frames.length === 0) throw new Error('ICON-D2 Wolken-Stack: keine Frames erzeugt');
  return { runAt, frames, corners };
}
