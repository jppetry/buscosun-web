/**
 * radarImgHourMean.ts — E-AX-16: das Radar-Stundenmittel als Produkt des Spiegels (`audit/fusion-ausbau.md` §6m).
 *
 * Producer-Seite des Vertrags in `radarImg.ts` (`RvImgHourMean`): aus den 25 Einzelframes eines RV-Slots (u8-Bytes, wie
 * sie in `f000…f120.png` liegen) je volle Stunde t nach dem Slot EIN Summenbild. Gerechnet wird NICHT in mm/h, sondern
 * auf den Rohbytes: R·256 + G = Summe der Bytes der Frames im Fenster, B = wie viele davon 255 (gesättigt) waren. Die
 * Umkehrung in mm/h (`nowcastHourMeanFromSum`, `point/nowcastFormat.ts`) ist damit exakt dieselbe Rechnung, die der
 * Motor mit `FuseCubeOptions.nowcastHourMean` über die Einzelframes macht — kein zweiter Quantisierungsschritt, keine
 * Totzone für Nieselstunden (ein nasser Frame von 0,5 mm/h unter elf trockenen ist 0,042 mm/h und bliebe im u8 eine 0).
 *
 * Die Abtastung am Punkt ist Nächster-Nachbar (`quadSampler.ts`): die Summe am Pixel ist die Summe der abgetasteten
 * Frame-Werte, also liefert dieses Bild am Punkt dasselbe Mittel wie zwölf Einzelabrufe (`verify:radar-repack` B).
 *
 * Genutzt vom Derive (`scripts/radar-mirror/radar-derive.mjs`) und vom Verifier — nicht vom Browser (kein Bundle-Byte).
 */

import { NOWCAST_HOUR_MEAN_MIN_FRAMES, NOWCAST_HOUR_MEAN_WINDOW_MIN, nowcastHourMeanFile } from '../point/nowcastFormat';
import type { RvImgHourMean } from './radarImg';

export interface RvHourMeanPlanEntry {
  /** Minuten Slot → Stundenende t. */
  lead: number;
  /** Die Frame-Leads im Fenster (lead − 60, lead], aufsteigend. */
  leads: number[];
}

/**
 * Welche Stundenmittel ein Slot trägt: jede volle Stunde t nach der Slotzeit, deren Fenster (t − 60 min, t]
 * mindestens `NOWCAST_HOUR_MEAN_MIN_FRAMES` Frames des Slots enthält. Slot :00 ⇒ Leads 60 (f005…f060) und 120 (f065…f120);
 * Slot :45 ⇒ 75 (f020…f075, 12) und 135 (f080…f120, 9); die erste Stunde nach einem Slot :45 (Lead 15, 4 Frames) gibt es nicht.
 */
export function rvHourMeanPlan(frameLeads: readonly number[], slotMs: number): RvHourMeanPlanEntry[] {
  const minute = Math.floor(slotMs / 60_000) % 60;
  const maxLead = Math.max(...frameLeads);
  const out: RvHourMeanPlanEntry[] = [];
  for (let lead = (60 - minute) % 60; lead - NOWCAST_HOUR_MEAN_WINDOW_MIN < maxLead; lead += 60) {
    const leads = frameLeads.filter((l) => l > lead - NOWCAST_HOUR_MEAN_WINDOW_MIN && l <= lead).sort((a, b) => a - b);
    if (leads.length >= NOWCAST_HOUR_MEAN_MIN_FRAMES) out.push({ lead, leads });
  }
  return out;
}

/** Das Summenbild (RGB, 3 Bytes je Pixel) aus den u8-Frames des Fensters. */
export function rvHourMeanImage(frames: ReadonlyArray<Uint8Array>, width: number, height: number): Uint8Array {
  const n = width * height;
  for (const f of frames) if (f.length !== n) throw new Error(`rvHourMeanImage: Frame mit ${f.length} statt ${n} Pixeln`);
  if (frames.length > 255) throw new Error('rvHourMeanImage: mehr als 255 Frames');
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    let sum = 0, sat = 0;
    for (const f of frames) { const b = f[i]; sum += b; if (b === 255) sat += 1; }
    out[i * 3] = sum >> 8; out[i * 3 + 1] = sum & 255; out[i * 3 + 2] = sat;
  }
  return out;
}

/** Pixel des Summenbilds (R, G, B) → Summe der Rohbytes und Zahl der gesättigten Frames. */
export function rvHourMeanPixel(r: number, g: number, b: number): { sum: number; nSat: number } {
  return { sum: r * 256 + g, nSat: b };
}

/** Der Meta-Eintrag zu einem Planeintrag. */
export function rvHourMeanMeta(entry: RvHourMeanPlanEntry, bytes: number): RvImgHourMean {
  return { lead: entry.lead, file: nowcastHourMeanFile(entry.lead), bytes, frames: entry.leads.length, leadFrom: entry.leads[0], leadTo: entry.leads[entry.leads.length - 1] };
}
