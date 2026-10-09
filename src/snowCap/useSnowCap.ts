/**
 * Phase SK: snow cap on one MapLibre map (2D map or ZT's 3D stage). Recomputes when the time key changes (5-min radar
 * frame / field hour) and after `moveend` (debounced). The engine (with the layer) is a lazy chunk; `?sklog=1` logs the
 * build time per image.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import type { CapPalette } from './snowCapModel';
import type { SnowCapInfo, SnowCapPrep, SnowCapLayer } from './snowCapEngine';
import type { ElevationTiles } from '../fusion/elevation';

type Engine = typeof import('./snowCapEngine');
let engineP: Promise<Engine> | null = null;
const loadEngine = () => (engineP ??= import('./snowCapEngine').catch((e) => { engineP = null; throw e; }));

const IDLE: SnowCapInfo = { status: 'idle', validMs: null, field: null, wet: 'none', notes: [], gapShare: null };
const LOG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sklog') === '1';

export interface SnowCapOpts { palette: CapPalette; beforeId: () => string | undefined; prefix: string; mobile: boolean }

export function useSnowCap(map: maplibregl.Map | null, active: boolean, tMs: number | null, opts: SnowCapOpts) {
  const [info, setInfo] = useState<SnowCapInfo>(IDLE);
  const [viewTick, setViewTick] = useState(0);
  const layerRef = useRef<SnowCapLayer | null>(null);
  const prepRef = useRef<SnowCapPrep | null>(null);
  const demRef = useRef<ElevationTiles | null>(null);
  const engRef = useRef<Engine | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const timeKey = tMs == null ? null : Math.round(tMs / 300_000);

  // Latest map/active for the async chains below (a chain started for one map never touches the next).
  const mapRef = useRef(map);
  mapRef.current = map;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => () => { layerRef.current?.remove(); layerRef.current = null; prepRef.current = null; demRef.current = null; }, [map]);
  useEffect(() => { layerRef.current?.setVisible(active); if (!active) setInfo(IDLE); }, [active, map]);

  // viewport: moveend → debounce 150 ms
  useEffect(() => {
    if (!map || !active) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = () => { if (t) clearTimeout(t); t = setTimeout(() => setViewTick((x) => x + 1), 150); };
    map.on('moveend', on);
    return () => { map.off('moveend', on); if (t) clearTimeout(t); };
  }, [map, active]);

  // time → field + wet. Coalesced: a running preparation is never aborted (during playback every 400 ms a new key would
  // starve it); when it finishes, the NEWEST pending key runs. "lädt …" only while there is no state yet. A failure clears
  // image and state — never an old hour under a new time.
  const busyRef = useRef(false);
  const pendingKeyRef = useRef<number | null>(null);
  const runPrepRef = useRef<(key: number) => void>(() => {});
  runPrepRef.current = (key: number) => {
    if (busyRef.current) { pendingKeyRef.current = key; return; }
    const forMap = mapRef.current;
    if (!forMap || !activeRef.current) return;
    busyRef.current = true;
    setInfo((p) => ({ ...p, status: prepRef.current ? p.status : 'loading' }));
    loadEngine()
      .then((eng) => {
        engRef.current = eng;
        if (mapRef.current === forMap && !layerRef.current) {
          layerRef.current = new eng.SnowCapLayer(forMap, { beforeId: () => optsRef.current.beforeId(), prefix: optsRef.current.prefix });
          layerRef.current.setVisible(activeRef.current);
        }
        return eng.prepareSnowCapTime(key * 300_000);
      })
      .then((prep) => {
        if (mapRef.current !== forMap || !activeRef.current) return;
        prepRef.current = prep; setInfo(prep.info); setViewTick((x) => x + 1);
      })
      .catch((e) => {
        if (mapRef.current !== forMap) return;
        prepRef.current = null; layerRef.current?.setData(null);
        setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : String(e) }));
      })
      .finally(() => {
        busyRef.current = false;
        const next = pendingKeyRef.current;
        pendingKeyRef.current = null;
        if (next != null) runPrepRef.current(next);
      });
  };
  useEffect(() => { if (map && active && timeKey != null) runPrepRef.current(timeKey); }, [map, active, timeKey]);

  // viewport or new state → raster. Coalesced as well: a running build finishes and is SHOWN (one frame old at most), then
  // the newest view/state runs once more.
  const rasterBusyRef = useRef(false);
  const rasterAgainRef = useRef(false);
  const runRasterRef = useRef<() => void>(() => {});
  runRasterRef.current = () => {
    const m = mapRef.current, eng = engRef.current, prep = prepRef.current, layer = layerRef.current;
    if (!m || !activeRef.current || !eng || !prep || !layer) return;
    if (rasterBusyRef.current) { rasterAgainRef.current = true; return; }
    const b = m.getBounds();
    const c = m.getCanvas();
    const ctr = m.getCenter();
    const view = eng.capViewFor({ west: b.getWest(), east: b.getEast(), north: b.getNorth(), south: b.getSouth() }, c.clientWidth, c.clientHeight, optsRef.current.mobile,
      { center: [ctr.lng, ctr.lat], pitched: m.getPitch() > 1 });
    if (!view || !prep.snow) { layer.setData(null); return; }
    rasterBusyRef.current = true;
    eng.renderSnowCap(prep, view, eng.demZoomFor(m.getZoom(), view), optsRef.current.palette, new AbortController().signal)
      .then(({ result, dem }) => {
        if (layerRef.current !== layer || mapRef.current !== m) return; // map or layer gone meanwhile
        demRef.current = dem;
        layer.setData(result);
        if (LOG && result) console.debug(`[sk] ${optsRef.current.prefix} ${result.width}×${result.height} ${result.stats.ms.toFixed(0)} ms`, result.stats);
      })
      .catch((e) => { if (layerRef.current === layer) setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : String(e) })); })
      .finally(() => {
        rasterBusyRef.current = false;
        if (rasterAgainRef.current) { rasterAgainRef.current = false; runRasterRef.current(); }
      });
  };
  useEffect(() => { runRasterRef.current(); }, [map, active, viewTick]);

  const pickAt = useMemo(() => (lat: number, lon: number) => engRef.current?.snowCapAt(prepRef.current, demRef.current, lat, lon) ?? null, []);
  const hoverAt = useMemo(() => (lat: number, lon: number): string | null => {
    const eng = engRef.current;
    if (!active || !eng) return null;
    return eng.snowCapHoverText(eng.snowCapAt(prepRef.current, demRef.current, lat, lon));
  }, [active]);
  return { info, hoverAt, pickAt };
}
