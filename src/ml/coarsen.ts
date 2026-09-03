/**
 * Flächengewichtete Blockung eines u8-Rasters (RADOLAN → Flussgitter) — rein,
 * DOM-frei, ohne Laufzeit-Importe, damit `verify:layer-geometry` sie headless
 * prüfen kann (der ML-Stack in `convNet.ts` ist für Node im Strip-Modus nicht
 * ladbar). `nowcasterInference.ts` re-exportiert beide Funktionen unverändert.
 *
 * **KL11 / B5 (2026-08-27):** W' = ceil(w/factor) Ausgabezellen kacheln die volle
 * Breite w — jede Zelle deckt genau w/W' native Spalten (RADOLAN: 1100/138 =
 * 7,971), Randspalten zählen anteilig. Vorher waren die Blöcke starr `factor`
 * breit: 1100/8 = 137,5 geht nicht auf, gezeichnet wurde die Ausgabe aber über
 * die vollen 1100 km ⇒ das Bild war nach Osten um bis zu 3,96 km gedehnt (KL1
 * B5; KL5 `ceil` hatte nur die 4 verlorenen Spalten zurückgeholt, nicht die
 * Dehnung — `audit/karten-layer-verortung.md` §13.2, Umsetzung §15.9). Geht
 * w/factor glatt auf (1200/8), sind alle Gewichte 1 und das Ergebnis ist mit dem
 * starren Blockmittel identisch. Der Zellwert ist das gewichtete Mittel (Summe
 * der Gewichte im Nenner) — konstante Felder bleiben konstant, die Gesamtmasse
 * bleibt erhalten. Die Zellmitte (cx+0,5)/W' liegt damit exakt auf ihrem nativen
 * Schwerpunkt: Karte (Textur über die Ecken), Punktabfrage (`pointPoP`),
 * PoP-Schleier und KI-Nowcaster sehen dieselbe Kachelung.
 */

import type { Tensor } from './convNet';

/** RADOLAN-u8-Frame → gröberes, normalisiertes Feld [1,H',W'] in [0,1] (flächengewichtetes Avg-Pool). */
export function coarsenFrameU8(values: Uint8Array, w: number, h: number, factor: number): Tensor {
  const W = Math.max(1, Math.ceil(w / factor)), H = Math.max(1, Math.ceil(h / factor));
  const data = new Float32Array(H * W);
  const spansX = blockSpans(w, W), spansY = blockSpans(h, H);
  for (let cy = 0; cy < H; cy++) {
    const sy = spansY[cy];
    for (let cx = 0; cx < W; cx++) {
      const sx = spansX[cx];
      let sum = 0, wsum = 0;
      for (let k = 0; k < sy.idx.length; k++) {
        const base = sy.idx[k] * w, wy = sy.wt[k];
        for (let m = 0; m < sx.idx.length; m++) {
          const ww = wy * sx.wt[m];
          sum += values[base + sx.idx[m]] * ww; wsum += ww;
        }
      }
      data[cy * W + cx] = wsum > 0 ? (sum / wsum) / 255 : 0;
    }
  }
  return { data, C: 1, H, W };
}

/** Native Indizes + Überlappungsgewichte (0..1] je Ausgabezelle, wenn n native
 *  Zellen gleichmäßig auf N Blöcke der Breite n/N verteilt werden. */
export function blockSpans(n: number, N: number): { idx: number[]; wt: number[] }[] {
  const size = n / N;
  const out: { idx: number[]; wt: number[] }[] = [];
  for (let c = 0; c < N; c++) {
    const a = c * size, b = Math.min(n, (c + 1) * size);
    const idx: number[] = [], wt: number[] = [];
    for (let i = Math.floor(a); i < b && i < n; i++) {
      const ov = Math.min(b, i + 1) - Math.max(a, i);
      if (ov > 1e-9) { idx.push(i); wt.push(ov); }
    }
    out.push({ idx, wt });
  }
  return out;
}
