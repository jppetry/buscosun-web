/**
 * Web-Worker: Zelle→Quellgitter-Index-Map für PrecipCompositor (s.
 * precipComposite.ts, buildCompositeIndexMap) — der Newton-Solver
 * (invBilinear, 8 Iterationen × 307.200 Zellen) kostet ~250-370 ms je Quelle
 * (4×-CPU-Throttle, gemessen) und läuft bisher synchron im build()-Render-Pfad
 * beim Zuschalten einer neuen Quelle (RADOLAN/INCA/rzc/ICON-D2). Nur DOM-freie
 * Importe → läuft sauber im Worker; lat/lon werden lokal neu aufgebaut statt
 * transferiert (s. gridLatLon in precipComposite.ts).
 *
 * Phase HD-1: zweite Aufgabe `op: 'mask'` — die Besitz-Maske eines nativen
 * Radargitters (`countryMaskForGrid`, ≈ 100 ms für DE1200). Ohne `op` wie bisher.
 */
/// <reference lib="webworker" />

import { buildCompositeIndexMap, type GridKind } from './precipIndexMap';
import { countryMaskForGrid, type HdGridKind } from './radarCountryMask';
import { estimateMorphFlow } from './radarMorphFlow';
import type { QuadCorners } from './RainLayer';

interface Req {
  id: number;
  op?: 'index' | 'mask' | 'flow';
  corners: QuadCorners;
  sCols: number;
  sRows: number;
  grid: GridKind;
  /** HD-4 (`op: 'flow'`): the two frames (native grid, `sCols × sRows`) and the coarsening factor. */
  aBuf?: ArrayBuffer;
  bBuf?: ArrayBuffer;
  factor?: number;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, op, corners, sCols, sRows, grid } = e.data;
  try {
    if (op === 'flow') {
      const f = estimateMorphFlow(new Uint8Array(e.data.aBuf!), new Uint8Array(e.data.bBuf!), sCols, sRows, e.data.factor ?? 8);
      (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
        { id, ok: true, flow: { uBuf: f.u.buffer, vBuf: f.v.buffer, w: f.w, h: f.h } },
        [f.u.buffer, f.v.buffer],
      );
      return;
    }
    if (op === 'mask') {
      const mask = countryMaskForGrid(grid as HdGridKind, corners, sCols, sRows);
      (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
        { id, ok: true, maskBuf: mask.buffer },
        [mask.buffer],
      );
      return;
    }
    const idx = buildCompositeIndexMap(corners, sCols, sRows, grid);
    (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
      { id, ok: true, idxBuf: idx.buffer },
      [idx.buffer],
    );
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void })
      .postMessage({ id, ok: false, error: String(err) });
  }
};
