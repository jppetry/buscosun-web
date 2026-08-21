/**
 * Web-Worker: Zelle→Quellgitter-Index-Map für PrecipCompositor (s.
 * precipComposite.ts, buildCompositeIndexMap) — der Newton-Solver
 * (invBilinear, 8 Iterationen × 307.200 Zellen) kostet ~250-370 ms je Quelle
 * (4×-CPU-Throttle, gemessen) und läuft bisher synchron im build()-Render-Pfad
 * beim Zuschalten einer neuen Quelle (RADOLAN/INCA/rzc/ICON-D2). Nur DOM-freie
 * Importe → läuft sauber im Worker; lat/lon werden lokal neu aufgebaut statt
 * transferiert (s. gridLatLon in precipComposite.ts).
 */
/// <reference lib="webworker" />

import { buildCompositeIndexMap, type GridKind } from './precipIndexMap';
import type { QuadCorners } from './RainLayer';

interface Req {
  id: number;
  corners: QuadCorners;
  sCols: number;
  sRows: number;
  grid: GridKind;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, corners, sCols, sRows, grid } = e.data;
  try {
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
