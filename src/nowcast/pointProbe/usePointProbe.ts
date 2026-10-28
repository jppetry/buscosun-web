/**
 * Regenradar — 3D-Punktansicht am Mauszeiger (Phase P3D): the hook. One state for stage and card.
 *
 *  - Hover is coalesced per animation frame; the radar value comes at once from the frames the map already shows
 *    (`ProfileRadarPick`, per country on its native grid — no new fetch), the point values from buscosun Fusion on the
 *    cube after `PROBE_POINT_DEBOUNCE_MS` of rest, cached per `PROBE_CACHE_CELL_DEG` cell, older calls aborted.
 *  - A click pins the point (the map's marker moves there anyway); a click on the pinned point or Esc releases it.
 *  - Time follows the slider: the pick carries the shown radar time, the point values take the Fusion hour containing it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Country } from '../../types';
import type { ProfileRadarPick } from '../../MapView';
import type { RadarStack } from '../../radar/radarFrames';
import type { Konrad3dRun } from '../../radar/konrad3d';
import type { PointForecast, PointForecastHour } from '../../pointForecast/types';
import type { PointForecastV2 } from '../../pointForecast/fusion/output';
import type { RadarGridSource } from '../../pointForecast/radarSample';
import { getPointForecast } from '../../pointForecast/pointForecast';
import { pfSourceFrom } from '../../pointForecast/pfFlags';
import { fastCountryPicker } from '../../scalar/radarCountryMask';
import { FUSION_NAME } from '../../pointForecast/fusion/fusionRelease';
import {
  cellAtPoint, derivePhase, haversineKm, sampleFrameMmH,
  PROBE_CACHE_CELL_DEG, PROBE_MEASURED_TOL_MS, PROBE_POINT_DEBOUNCE_MS,
  type PhaseResult, type ProbeCell, type ProbeZone,
} from './probeModel';

/** `?p3d=0` → the dock shows no point view (the hover readout of the map stays as before). Anything else → on. */
export function pointProbeEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get('p3d') !== '0'; } catch { return true; }
}

const SOURCE_OF: Record<Country, RadarGridSource> = { DE: 'radolan_rv', AT: 'inca_grid', CH: 'meteoswiss_rzc' };
// Phase NC: AT and CH carry the derived products' names when the deck stack has them (the stack's `sourceLabel`); these are the words before.
const SOURCE_LABEL: Record<Country, string> = { DE: 'DWD RADOLAN-RV', AT: 'GeoSphere INCA', CH: 'MeteoSchweiz rzc' };
/** Two clicks closer than this (km) release the pin instead of moving it. */
const UNPIN_KM = 0.5;
/** Hours of buscosun Fusion asked per point — the radar axis spans −2 … +3 h, the model zone just beyond. */
const PROBE_HOURS = 6;

export interface ProbePointValues {
  /** Validity of the hour used (end of the hour). */
  atMs: number;
  tempC: number | null;
  rhPct: number | null;
  /** Dew point from buscosun Fusion (`td2m` median) when it carries one. */
  dewPointC: number | null;
  windMs: number | null;
  windDirDeg: number | null;
  gustMs: number | null;
  snowLineM: number | null;
  /** Height of the point (m) — `null` when the cube path had no terrain. */
  elevM: number | null;
  /** Rate of buscosun Fusion in that hour (mm/h) — the „Modell" rate beyond the radar. */
  precipMmH: number | null;
  pSnow: number | null;
  interpolated: boolean;
}

export interface ProbeRadar {
  country: Country;
  sourceLabel: string;
  frameMs: number;
  /** mm/h at the pointer; `null` = outside the country's grid at this time. */
  mmH: number | null;
  zone: Exclude<ProbeZone, 'model'>;
}

export interface ProbeState {
  mode: 'idle' | 'hover' | 'pinned';
  at: { lat: number; lon: number } | null;
  country: Country | null;
  /** The time the view shows (slider / shown radar frame). */
  timeMs: number | null;
  radar: ProbeRadar | null;
  point: { status: 'idle' | 'loading' | 'ready' | 'gap'; values: ProbePointValues | null; reason: string | null; fusionName: string };
  cell: ProbeCell | null;
  phase: PhaseResult;
  /** Effective rate: the radar's, or the model's beyond the radar (`zone === 'model'`); `null` = unknown. */
  rateMmH: number | null;
  zone: ProbeZone | null;
}

export interface ProbeInputs {
  enabled: boolean;
  pick: ProfileRadarPick | null;
  stack: RadarStack | null | undefined;
  cellsRun: Konrad3dRun | null;
  sliderMs: number | null;
  /** Newest RV analysis (ms) — the measured/nowcast seam of the DE frames when the stack is not DE. */
  rvRunAtMs: number | null;
}

interface PointBundle { fc: PointForecast; v2: PointForecastV2 | null }

const IDLE_POINT: ProbeState['point'] = { status: 'idle', values: null, reason: null, fusionName: FUSION_NAME };
const EMPTY: ProbeState = { mode: 'idle', at: null, country: null, timeMs: null, radar: null, point: IDLE_POINT, cell: null, phase: { phase: null, basis: 'none' }, rateMmH: null, zone: null };

function cellKey(lat: number, lon: number): string {
  return `${Math.round(lat / PROBE_CACHE_CELL_DEG)}:${Math.round(lon / PROBE_CACHE_CELL_DEG)}`;
}
function cellCenter(lat: number, lon: number): { lat: number; lon: number } {
  return { lat: Math.round(lat / PROBE_CACHE_CELL_DEG) * PROBE_CACHE_CELL_DEG, lon: Math.round(lon / PROBE_CACHE_CELL_DEG) * PROBE_CACHE_CELL_DEG };
}

/** The Fusion hour that contains `timeMs` (a step at t is the mean over (t − 1 h, t]); the first/last beyond the axis. */
function hourAt(hours: PointForecastHour[], timeMs: number): PointForecastHour | null {
  if (!hours.length) return null;
  for (const h of hours) if (h.timestamp.getTime() >= timeMs) return h;
  return hours[hours.length - 1];
}

function valuesAt(b: PointBundle, timeMs: number): ProbePointValues | null {
  const h = hourAt(b.fc.hours, timeMs);
  if (!h) return null;
  const atMs = h.timestamp.getTime();
  const step = b.v2?.axis.steps.find((s) => s.validAtMs === atMs) ?? null;
  const td = step?.vars.td2m?.p50;
  const pSnowV2 = step?.vars.pSnow?.p50;
  const elev = b.fc.query.elevation;
  return {
    atMs,
    tempC: h.temperature,
    rhPct: h.relativeHumidity,
    dewPointC: td != null && Number.isFinite(td) ? td : null,
    windMs: h.windSpeed,
    windDirDeg: h.windDirection,
    gustMs: h.gustSpeed,
    snowLineM: h.snowLineM,
    elevM: Number.isFinite(elev) && elev > 0 ? elev : null,
    precipMmH: h.precipitation,
    pSnow: h.fusion?.pSnow ?? (pSnowV2 != null && Number.isFinite(pSnowV2) ? pSnowV2 : null),
    interpolated: !!(step?.interpolated),
  };
}

export function usePointProbe(i: ProbeInputs): {
  state: ProbeState;
  onHover: (p: { lat: number; lon: number } | null) => void;
  onClick: (lat: number, lon: number) => void;
  unpin: () => void;
} {
  const { enabled, pick, stack, cellsRun, sliderMs, rvRunAtMs } = i;
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const pendingRef = useRef<{ lat: number; lon: number } | null | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  // Hover coalesced per frame: many mousemove events → one state update per animation frame.
  const onHover = useCallback((p: { lat: number; lon: number } | null) => {
    if (!enabled) return;
    pendingRef.current = p;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const q = pendingRef.current;
      pendingRef.current = undefined;
      if (q !== undefined) setHover(q);
    });
  }, [enabled]);
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const pinRef = useRef(pin);
  pinRef.current = pin;
  const onClick = useCallback((lat: number, lon: number) => {
    if (!enabled) return;
    const cur = pinRef.current;
    if (cur && haversineKm(cur.lat, cur.lon, lat, lon) < UNPIN_KM) { setPin(null); return; }
    setPin({ lat, lon });
  }, [enabled]);
  const unpin = useCallback(() => setPin(null), []);
  useEffect(() => {
    if (!pin) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPin(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin]);

  const at = enabled ? (pin ?? hover) : null;
  const mode: ProbeState['mode'] = !at ? 'idle' : pin ? 'pinned' : 'hover';
  const country = useMemo<Country | null>(() => (at ? fastCountryPicker()(at.lat, at.lon) : null), [at]);

  // Radar at the pointer: the shown frame of the pointer's country (pick), else the deck stack of that country.
  const radar = useMemo<ProbeRadar | null>(() => {
    if (!at || !country) return null;
    const src = SOURCE_OF[country];
    const pf = pick?.[country];
    if (pf && pick) {
      const mmH = sampleFrameMmH(src, pf, at.lat, at.lon);
      return { country, sourceLabel: SOURCE_LABEL[country], frameMs: pick.timeMs, mmH, zone: zoneOf(country, pick.timeMs, stack, rvRunAtMs) };
    }
    if (stack && stack.country === country && stack.frames.length && sliderMs != null) {
      let best = stack.frames[0], bd = Infinity;
      for (const f of stack.frames) { const d = Math.abs(f.timeMs - sliderMs); if (d < bd) { bd = d; best = f; } }
      if (bd > 30 * 60_000) return null;
      const mmH = sampleFrameMmH(src, { values: best.values, values2: best.values2, width: best.width, height: best.height, corners: stack.corners }, at.lat, at.lon);
      return { country, sourceLabel: SOURCE_LABEL[country], frameMs: best.timeMs, mmH, zone: best.measured ? 'measured' : 'nowcast' };
    }
    return null;
  }, [at, country, pick, stack, sliderMs, rvRunAtMs]);

  // Point values of buscosun Fusion: debounced, cached per cell, aborted when the pointer moves on.
  const cacheRef = useRef(new Map<string, PointBundle>());
  const [bundle, setBundle] = useState<{ key: string; b: PointBundle | null; status: 'loading' | 'ready' | 'gap'; reason: string | null } | null>(null);
  const key = at ? cellKey(at.lat, at.lon) : null;
  const center = at ? cellCenter(at.lat, at.lon) : null;
  const cLat = center?.lat, cLon = center?.lon;
  useEffect(() => {
    if (!key || cLat == null || cLon == null || !country) { setBundle(null); return; }
    const hit = cacheRef.current.get(key);
    if (hit) { setBundle({ key, b: hit, status: 'ready', reason: null }); return; }
    if (pfSourceFrom(typeof window !== 'undefined' ? window.location.search : '') === 'live') {
      setBundle({ key, b: null, status: 'gap', reason: 'buscosun Fusion abgeschaltet (?pf=live)' }); return;
    }
    const ac = new AbortController();
    let alive = true;
    const t = window.setTimeout(() => {
      setBundle({ key, b: null, status: 'loading', reason: null });
      import('../../pointForecast/cubeSource')
        .then(() => getPointForecast({ lat: cLat, lng: cLon, country, hours: PROBE_HOURS, signal: ac.signal, includeRadarNowcast: false, pointSource: 'cube' }))
        .then((fc) => {
          if (!alive || ac.signal.aborted) return;
          const v2 = (fc.cube as { v2?: PointForecastV2 } | undefined)?.v2 ?? null;
          const b: PointBundle = { fc, v2 };
          cacheRef.current.set(key, b);
          if (cacheRef.current.size > 64) { const k0 = cacheRef.current.keys().next().value; if (k0 !== undefined) cacheRef.current.delete(k0); }
          setBundle({ key, b, status: 'ready', reason: null });
        })
        .catch((e: unknown) => {
          if (!alive || ac.signal.aborted || (e as { name?: string })?.name === 'AbortError') return;
          setBundle({ key, b: null, status: 'gap', reason: `buscosun Fusion nicht verfügbar (${e instanceof Error ? e.message : String(e)})` });
        });
    }, PROBE_POINT_DEBOUNCE_MS);
    return () => { alive = false; ac.abort(); window.clearTimeout(t); };
  }, [key, cLat, cLon, country]);

  const timeMs = radar?.frameMs ?? sliderMs ?? null;
  const point = useMemo<ProbeState['point']>(() => {
    if (!key) return IDLE_POINT;
    if (!bundle || bundle.key !== key) return { ...IDLE_POINT, status: 'loading' };
    if (bundle.status !== 'ready' || !bundle.b) return { ...IDLE_POINT, status: bundle.status, reason: bundle.reason };
    const values = valuesAt(bundle.b, timeMs ?? Date.now());
    return values ? { status: 'ready', values, reason: null, fusionName: FUSION_NAME } : { ...IDLE_POINT, status: 'gap', reason: 'keine Stunde von buscosun Fusion' };
  }, [key, bundle, timeMs]);

  const cell = useMemo(() => (at ? cellAtPoint(cellsRun, at.lat, at.lon) : null), [at, cellsRun]);

  const state = useMemo<ProbeState>(() => {
    if (!at || !country) return EMPTY;
    const v = point.values;
    let rateMmH: number | null = null;
    let zone: ProbeZone | null = null;
    if (radar && radar.mmH != null) { rateMmH = radar.mmH; zone = radar.zone; }
    else if (v && v.precipMmH != null) { rateMmH = v.precipMmH; zone = 'model'; }
    const phase = derivePhase({
      rateMmH: rateMmH ?? 0, pSnow: v?.pSnow ?? null, tempC: v?.tempC ?? null, rhPct: v?.rhPct ?? null,
      snowLineM: v?.snowLineM ?? null, elevM: v?.elevM ?? null, hailEvidence: !!cell?.inside && cell.hail,
    });
    return { mode, at, country, timeMs, radar, point, cell, phase, rateMmH, zone };
  }, [at, country, mode, timeMs, radar, point, cell]);

  return { state, onHover, onClick, unpin };
}

/** measured | nowcast of a frame time: CH only measures; DE against the newest RV analysis; AT (INCA) never measures. */
function zoneOf(country: Country, frameMs: number, stack: RadarStack | null | undefined, rvRunAtMs: number | null): Exclude<ProbeZone, 'model'> {
  if (country === 'CH') return 'measured';
  if (country === 'AT') return 'nowcast';
  const newest = stack && stack.country === 'DE' ? stack.frames[stack.nowIndex]?.timeMs ?? null : rvRunAtMs;
  if (newest == null) return 'nowcast';
  return frameMs <= newest + PROBE_MEASURED_TOL_MS ? 'measured' : 'nowcast';
}
