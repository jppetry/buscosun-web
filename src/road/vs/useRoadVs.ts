/**
 * AW-6.2.9 — the page's loader of the virtual road sensor: the newest run's corridor file (axis points + the corridor's
 * stations), re-read every 10 min, nothing while the switch is off. A failed refresh keeps the shown run; a stale run
 * (older than `ROAD_VS_STALE_MS`) is reported and not shown by the readout.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadRoadVs, type RoadVsLoad } from './roadVsClient';
import type { RoadVsProductFile, RoadVsProductPoint } from './roadVsProduct';

const VS_REFRESH_MS = 10 * 60_000;
const EMPTY: ReadonlyMap<string, RoadVsProductPoint> = new Map();

export interface RoadVsView {
  /** The shown run file (null = off, loading, missing or stale — `reason` says which). */
  file: RoadVsProductFile | null;
  byId: ReadonlyMap<string, RoadVsProductPoint>;
  run: string | null;
  stale: boolean;
  reason: string | null;
}
export const ROAD_VS_OFF: RoadVsView = Object.freeze({ file: null, byId: EMPTY, run: null, stale: false, reason: 'aus' });

export function useRoadVs(on: boolean, corridorId: string | null): RoadVsView {
  const [load, setLoad] = useState<{ corridor: string; load: RoadVsLoad } | null>(null);
  useEffect(() => {
    if (!on || !corridorId) return;
    let ac = new AbortController();
    let alive = true;
    const run = () => {
      loadRoadVs('corridor', corridorId, Date.now(), ac.signal).then((l) => {
        if (alive) setLoad((prev) => (l.file || prev?.corridor !== corridorId || !prev.load.file ? { corridor: corridorId, load: l } : prev));
      }, () => {});
    };
    run();
    const id = window.setInterval(() => { ac.abort(); ac = new AbortController(); run(); }, VS_REFRESH_MS);
    return () => { alive = false; ac.abort(); window.clearInterval(id); };
  }, [on, corridorId]);
  const own = on && load && load.corridor === corridorId ? load.load : null;
  return useMemo<RoadVsView>(() => {
    if (!on) return ROAD_VS_OFF;
    if (!own) return { file: null, byId: EMPTY, run: null, stale: false, reason: 'lädt' };
    const file = own.file && !own.stale ? own.file : null;
    return { file, byId: file ? new Map(file.points.map((p) => [p.id, p] as const)) : EMPTY, run: own.run, stale: own.stale, reason: file ? null : own.stale ? 'Lauf älter als 9 Stunden' : own.reason };
  }, [on, own]);
}
