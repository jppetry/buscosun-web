/**
 * FastMapPage — schlanker Performance-Prototyp der 2D-Wetterkarte.
 *
 * ZWECK: Dieselben drei teuersten Layer (Wind · Niederschlag · Temperatur) aus
 * denselben echten Quellen (DWD ICON-D2 über den Vite-Proxy) rendern wie die
 * Produktions-`MapView`, aber in einer bewusst MINIMALEN Shell, um den reinen
 * Render-Pfad zu messen. Erreichbar nur über `#fast`, keine UI-Verlinkung,
 * kein Eingriff in MapView.
 *
 * PERF-THESE (empirisch mit perfHud belegbar, nicht behauptet):
 *   1. Temperatur über `FastScalarLayer`: zwei Frames als Texturen, Zeit-
 *      Interpolation IM SHADER → Sub-Stunden-Scrubbing ohne CPU-Rebuild.
 *   2. Schlanke Shell: KEIN Dim-Overlay, KEINE Länder-Maske, KEINE City-Label-
 *      Sampling-Schleife pro Move, KEIN Confidence-Veil, KEIN DEM-Pass — nur
 *      Basemap + 3 Datenlayer.
 *   3. Wind & Niederschlag verwenden die bewährten Produktions-Layer
 *      (`WindLayer` mit adaptivem FrameGovernor, `RainLayer`) unverändert —
 *      der Gewinn kommt aus (1)+(2), nicht aus einem Nachbau der Engine.
 *
 * Das In-Page-Readout liest `window.__perfHud.snapshot()` (FPS / Frame-p95 /
 * MapLibre-Repaints), damit sich der Prototyp direkt gegen die echte Seite
 * (im zweiten Tab unter `#m=`) vergleichen lässt.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FastScalarLayer } from './FastScalarLayer';
import { temperatureRamp } from '../../scalar/ScalarLayer';
import { RainLayer, precipRainRamp } from '../../scalar/RainLayer';
import { WindLayer } from '../../wind/WindLayer';
import { fetchIconD2Temp, type IconD2Temp } from '../../sources/iconD2TempSource';
import { fetchIconD2Precip, type IconD2Precip } from '../../sources/iconD2Precip';
import { fetchIconD2Wind, windFrameAtValidTimeAsync, type IconD2Wind } from '../../wind/iconD2WindSource';
import { frameAtValidTime } from '../../sources/frameAtValidTime';

type LayerKind = 'temp' | 'precip' | 'wind';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const HOUR_MAX = 12; // Wind-Horizont (ICON-D2 u/v_10m) ist die engste Grenze.
const TEMP_LAYER_ID = 'fast-temp';
const PRECIP_LAYER_ID = 'fast-precip';
const WIND_LAYER_ID = 'fast-wind';

/** Bracketing-Frames + Sub-Stunden-Bruch für die GPU-Zeitmischung. */
function bracket<T extends { validAt: Date }>(frames: T[], targetMs: number): { a: T; b: T; frac: number } {
  if (frames.length === 1) return { a: frames[0], b: frames[0], frac: 0 };
  let i = 0;
  for (; i < frames.length - 1; i++) {
    if (targetMs < frames[i + 1].validAt.getTime()) break;
  }
  const a = frames[Math.min(i, frames.length - 1)];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.validAt.getTime() - a.validAt.getTime();
  const frac = span > 0 ? Math.max(0, Math.min(1, (targetMs - a.validAt.getTime()) / span)) : 0;
  return { a, b, frac };
}

export default function FastMapPage({ onBack }: { onBack: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);

  // Datensätze (mutable refs — werden progressiv per onProgress befüllt).
  const tempData = useRef<IconD2Temp | null>(null);
  const precipData = useRef<IconD2Precip | null>(null);
  const windData = useRef<IconD2Wind | null>(null);

  // Layer-Instanzen (einmal erzeugt).
  const tempLayer = useRef<FastScalarLayer | null>(null);
  const precipLayer = useRef<RainLayer | null>(null);
  const windLayer = useRef<WindLayer | null>(null);

  const [hour, setHour] = useState(0);
  const [enabled, setEnabled] = useState<Record<LayerKind, boolean>>({ temp: true, precip: true, wind: true });
  const [load, setLoad] = useState<Record<LayerKind, LoadState>>({ temp: 'idle', precip: 'idle', wind: 'idle' });
  const [perf, setPerf] = useState<
    { fps: number; p95: number; repaints: number; heap: number | null; blockingMs: number; throttled: boolean } | null
  >(null);

  // Aktuelle Werte für Callbacks ohne Stale-Closure.
  const hourRef = useRef(hour);
  const enabledRef = useRef(enabled);
  hourRef.current = hour;
  enabledRef.current = enabled;
  const windTokenRef = useRef(0);

  const beforeSymbolId = useCallback((map: MapLibreMap): string | undefined => {
    for (const l of map.getStyle().layers ?? []) {
      if (l.type === 'symbol') return l.id;
    }
    return undefined;
  }, []);

  // Idempotenter Abgleich: bringt Karte in den Zustand (hour, enabled, Daten).
  const sync = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const targetMs = Date.now() + hourRef.current * 3600_000;
    const before = beforeSymbolId(map);
    const en = enabledRef.current;

    // — Temperatur —
    const tl = tempLayer.current;
    if (tl && en.temp && tempData.current && tempData.current.frames.length) {
      if (!map.getLayer(TEMP_LAYER_ID)) map.addLayer(tl, before);
      const td = tempData.current;
      const { a, b, frac } = bracket(td.frames, targetMs);
      tl.setPair(a.image, b.image, { uvBounds: td.uvBounds });
      tl.setFrac(frac);
    } else if (tl && map.getLayer(TEMP_LAYER_ID)) {
      map.removeLayer(TEMP_LAYER_ID);
    }

    // — Niederschlag —
    const pl = precipLayer.current;
    if (pl && en.precip && precipData.current && precipData.current.frames.length) {
      if (!map.getLayer(PRECIP_LAYER_ID)) map.addLayer(pl, before);
      const pd = precipData.current;
      const f = frameAtValidTime(pd.frames, targetMs);
      pl.setFrame({ values: f.values, width: f.width, height: f.height, corners: pd.corners });
    } else if (pl && map.getLayer(PRECIP_LAYER_ID)) {
      map.removeLayer(PRECIP_LAYER_ID);
    }

    // — Wind (async: Frame-Blend/Upsample im Worker) —
    const wl = windLayer.current;
    if (wl && en.wind && windData.current && windData.current.frames.length) {
      if (!map.getLayer(WIND_LAYER_ID)) map.addLayer(wl); // oben auf, kein beforeId
      const wd = windData.current;
      const token = ++windTokenRef.current;
      windFrameAtValidTimeAsync(wd, targetMs, wl.upsampleFactor, wl.windTextureKind)
        .then((res) => {
          if (token !== windTokenRef.current) return; // veraltet
          if (res.kind === 'image') {
            wl.setWindData(res.frame.image, {
              width: res.frame.width, height: res.frame.height,
              uMin: res.frame.uMin, uMax: res.frame.uMax, vMin: res.frame.vMin, vMax: res.frame.vMax,
              uvBounds: wd.uvBounds,
            });
          } else {
            wl.setWindDataPacked(res.packed, res.width, res.height, {
              width: res.width, height: res.height,
              uMin: res.uMin, uMax: res.uMax, vMin: res.vMin, vMax: res.vMax,
              uvBounds: wd.uvBounds,
            }, res.key);
          }
        })
        .catch(() => { /* Frame-Miss ignorieren */ });
    } else if (wl && map.getLayer(WIND_LAYER_ID)) {
      map.removeLayer(WIND_LAYER_ID);
    }
  }, [beforeSymbolId]);

  // Karte einmalig aufsetzen + Loader starten.
  useEffect(() => {
    if (!containerRef.current) return;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const dpr = window.devicePixelRatio || 1;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [10.5, 50.2],
      zoom: 5.3,
      pixelRatio: coarse ? Math.min(dpr, 1.5) : dpr,
      refreshExpiredTiles: false,
      fadeDuration: 0,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    // Perf-HUD an die Karte hängen → echte MapLibre-Repaints werden gezählt.
    if (import.meta.env.DEV) {
      window.__perfHud?.attachMap(map);
      (window as unknown as { __fastmap?: MapLibreMap }).__fastmap = map;
    }

    // Layer-Instanzen (Konstruktion wie in MapView, schlanke Auswahl).
    tempLayer.current = new FastScalarLayer({
      id: TEMP_LAYER_ID, colorRamp: temperatureRamp, visRange: { start: 0, end: 0 },
      opacity: 0.95, zoomAttenuation: { from: 11, perStep: 0.08, floor: 0.7 },
    });
    precipLayer.current = new RainLayer({ id: PRECIP_LAYER_ID, colorRamp: precipRainRamp, opacity: 0.85 });
    windLayer.current = new WindLayer({
      windPngUrl: '', windJsonUrl: '',
      speedFactor: 0.02, speedRefZoom: 5.5, speedZoomDamping: 0,
      speedGamma: 0.5, speedRef: 5, speedMin: 2,
      reduceMotionOnMove: coarse,
      upsample: coarse ? 1 : 2,
      maxParticleFps: coarse ? 30 : 0,
    });

    const onLoad = () => {
      readyRef.current = true;
      sync();
    };
    if (map.isStyleLoaded()) onLoad(); else map.once('load', onLoad);

    // Loader parallel starten. onProgress → progressiver First Paint.
    const ac = new AbortController();
    setLoad((s) => ({ ...s, temp: 'loading', precip: 'loading', wind: 'loading' }));
    // Fehler nur melden, wenn NICHT durch (StrictMode-)Unmount abgebrochen.
    const fail = (k: LayerKind) => () => { if (!ac.signal.aborted) setLoad((s) => ({ ...s, [k]: 'error' })); };
    fetchIconD2Temp(ac.signal, (partial) => { tempData.current = partial; sync(); })
      .then((full) => { tempData.current = full; setLoad((s) => ({ ...s, temp: 'ready' })); sync(); })
      .catch(fail('temp'));
    fetchIconD2Precip(ac.signal, (partial) => { precipData.current = partial; sync(); })
      .then((full) => { precipData.current = full; setLoad((s) => ({ ...s, precip: 'ready' })); sync(); })
      .catch(fail('precip'));
    fetchIconD2Wind(ac.signal, (partial) => { windData.current = partial; sync(); })
      .then((full) => { windData.current = full; setLoad((s) => ({ ...s, wind: 'ready' })); sync(); })
      .catch(fail('wind'));

    // Perf-Readout pollen.
    const pollId = window.setInterval(() => {
      const snap = window.__perfHud?.snapshot() as
        | {
            window?: { fps?: number; frameP95?: number; repaintsPerSec?: number; heapMB?: number | null };
            session?: { frames?: number; longTask?: { totalBlockingMs?: number } };
          }
        | undefined;
      if (!snap?.window) return;
      const w = snap.window;
      // rAF wird im In-App-Browser gedrosselt → frames==0 ⇒ FPS unbrauchbar hier.
      const throttled = (snap.session?.frames ?? 0) < 5;
      setPerf({
        fps: w.fps ?? 0, p95: w.frameP95 ?? 0,
        repaints: w.repaintsPerSec ?? 0, heap: w.heapMB ?? null,
        blockingMs: Math.round(snap.session?.longTask?.totalBlockingMs ?? 0),
        throttled,
      });
    }, 500);

    return () => {
      ac.abort();
      window.clearInterval(pollId);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [sync]);

  // Auf Stunden-/Toggle-Änderung neu abgleichen.
  useEffect(() => { sync(); }, [hour, enabled, sync]);

  const toggle = (k: LayerKind) => setEnabled((e) => ({ ...e, [k]: !e[k] }));
  const targetDate = new Date(Date.now() + hour * 3600_000);
  const hourLabel = hour === 0 ? 'jetzt' : `+${hour} h`;
  const timeLabel = targetDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const chip = (k: LayerKind, label: string, hint: string) => {
    const st = load[k];
    const on = enabled[k];
    return (
      <button
        onClick={() => toggle(k)}
        style={{
          display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
          padding: '8px 12px', minHeight: 44, borderRadius: 10, cursor: 'pointer',
          border: '1px solid ' + (on ? 'rgba(80,130,220,0.9)' : 'rgba(255,255,255,0.18)'),
          background: on ? 'rgba(60,110,210,0.28)' : 'rgba(20,26,40,0.55)',
          color: '#eef2ff', font: '500 13px/1.2 system-ui, sans-serif', textAlign: 'left',
        }}
      >
        <span>{on ? '●' : '○'} {label}</span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          {st === 'loading' ? 'lädt …' : st === 'ready' ? hint : st === 'error' ? '⚠ Fehler' : '—'}
        </span>
      </button>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0e16' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Kopf: zurück + Titel */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 10, alignItems: 'center', zIndex: 5 }}>
        <button
          onClick={onBack}
          style={{
            minHeight: 44, minWidth: 44, borderRadius: 10, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(20,26,40,0.65)',
            color: '#eef2ff', font: '600 15px system-ui', padding: '0 14px',
          }}
        >← zurück</button>
        <div style={{ color: '#eef2ff', font: '600 14px system-ui', textShadow: '0 1px 3px #000' }}>
          Fast-2D · Perf-Prototyp <span style={{ opacity: 0.6, fontWeight: 400 }}>(#fast)</span>
        </div>
      </div>

      {/* Perf-Readout */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 5,
        padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(12,16,26,0.8)', color: '#dfe7ff', font: '500 12px/1.5 ui-monospace, monospace',
        minWidth: 150,
      }}>
        <div style={{ opacity: 0.6, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>perfHud</div>
        {perf?.throttled ? (
          <div style={{ color: '#ffcf8a', maxWidth: 170 }}>
            FPS n/a<div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.3, marginTop: 2 }}>
              rAF im In-App-Browser gedrosselt — FPS nur auf echtem Gerät/Chrome valide.
            </div>
          </div>
        ) : (
          <>
            <div>FPS <b style={{ color: perf && perf.fps < 40 ? '#ff9a7a' : '#8ef0b0' }}>{perf?.fps ?? '—'}</b></div>
            <div>Frame-p95 {perf ? perf.p95 + ' ms' : '—'}</div>
            <div>Repaints/s {perf?.repaints ?? '—'}</div>
          </>
        )}
        <div style={{ marginTop: 4 }}>Blocking {perf ? perf.blockingMs + ' ms' : '—'}</div>
        <div>Heap {perf?.heap != null ? perf.heap + ' MB' : '—'}</div>
      </div>

      {/* Steuerung unten */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', zIndex: 5,
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: 12, borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(12,16,26,0.82)', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chip('wind', 'Wind', 'ICON-D2 10 m')}
          {chip('precip', 'Niederschlag', 'ICON-D2 tot_prec')}
          {chip('temp', 'Temperatur', 'ICON-D2 t_2m')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: '#eef2ff', font: '600 13px system-ui', minWidth: 92 }}>
            {hourLabel} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {timeLabel}</span>
          </div>
          <input
            type="range" min={0} max={HOUR_MAX} step={1} value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            style={{ flex: 1, height: 44, accentColor: '#5a82dc' }}
          />
        </div>
      </div>
    </div>
  );
}
