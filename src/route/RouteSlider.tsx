/**
 * Phase TE — the route slider of the new result (glass bar on the stage, docked above the bottom bar on mobile).
 *
 * The track is laid out by DISTANCE: wind-relation band on top, elevation profile with rain shading below, ◆ for weather
 * changes, dashed lines for breaks. The position snaps to the samples (`nearestSampleIndex`) — values exist only there
 * (`audit/tour-ergebnis.md` §1.4, E-TE-4). A native `<input type="range">` carries keyboard and screen reader; the pointer
 * is handled on the whole track (distance → sample), so the input itself takes no pointer events.
 *
 * Weather overlays come only from `wx` (the samples of the CURRENT plan with fresh values) — while the weather is being
 * refetched the track shows the geometry and nothing else (V-R3D-3).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Milestone, SampleETA } from './tourTiming';
import type { TourPoint } from './tourTrack';
import { nearestSampleIndex, TOUR_WET_MMH, windRelationAt, WIND_REL_COLOR, type WeatherChange } from './tourResultModel';
import { clock } from './tourUi';
import { IconPause, IconPlay } from './routeIcons';

const VW = 1000, VH = 64, BAND_H = 5, PROF_T = 14, PROF_B = 52;
/** Play steps one sample per tick (ms). */
const PLAY_TICK_MS = 160;

interface Props {
  /** Samples of the current plan (geometry, ETA, elevation) — always valid for the plan on screen. */
  samples: SampleETA[];
  /** The same samples with fresh weather, or null while the weather is (re)loading. */
  wx: SampleETA[] | null;
  points: TourPoint[];
  milestones: Milestone[];
  events: WeatherChange[];
  idx: number;
  onIdx: (i: number) => void;
  /** Mobile: smaller track, only start/finish ticks. */
  compact: boolean;
  /** Left part of the head (readout); the slider owns the buttons. */
  readout: ReactNode;
}

const kmStr = (m: number) => (m / 1000).toFixed(1).replace('.', ',');

function RouteSlider({ samples, wx, points, milestones, events, idx, onIdx, compact, readout }: Props) {
  const n = samples.length;
  const d0 = n ? samples[0].dist : 0;
  const d1 = n ? samples[n - 1].dist : 1;
  const span = Math.max(1, d1 - d0);
  const x = useCallback((d: number) => ((d - d0) / span) * VW, [d0, span]);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const svg = useMemo(() => {
    if (n < 2) return null;
    let e0 = Infinity, e1 = -Infinity;
    for (const s of samples) if (Number.isFinite(s.ele)) { e0 = Math.min(e0, s.ele); e1 = Math.max(e1, s.ele); }
    if (!Number.isFinite(e0)) { e0 = 0; e1 = 1; }
    if (e1 - e0 < 1) e1 = e0 + 1;
    const y = (e: number) => PROF_B - ((e - e0) / (e1 - e0)) * (PROF_B - PROF_T - 4);
    const band: ReactNode[] = [];
    const rain: ReactNode[] = [];
    if (wx) {
      // each sample stands for half the gap to its neighbours (the same weighting as `sampleSpansM`)
      wx.forEach((s, i) => {
        const a = x(i > 0 ? (wx[i - 1].dist + s.dist) / 2 : d0);
        const b = x(i < wx.length - 1 ? (s.dist + wx[i + 1].dist) / 2 : d1);
        const r = windRelationAt(s, points);
        band.push(<rect key={`b${i}`} x={a} y={0} width={Math.max(0.6, b - a + 0.4)} height={BAND_H} fill={r ? WIND_REL_COLOR[r.rel] : 'var(--sand-200, #E0D6BE)'} />);
        const mm = s.weather?.precipitationMmH;
        if (mm != null && mm >= TOUR_WET_MMH) {
          rain.push(<rect key={`r${i}`} x={a} y={PROF_T - 2} width={Math.max(0.6, b - a + 0.4)} height={PROF_B - PROF_T + 2} fill="var(--steel-600, #3A6FA8)" opacity={Math.min(0.42, 0.14 + mm * 0.18)} />);
        }
      });
    }
    let line = '';
    samples.forEach((s) => { if (Number.isFinite(s.ele)) line += `${line ? 'L' : 'M'}${x(s.dist).toFixed(1)} ${y(s.ele).toFixed(1)} `; });
    const area = line ? `${line}L${VW} ${PROF_B} L0 ${PROF_B} Z` : '';
    const breaks = milestones.filter((m) => m.kind === 'rest' || m.kind === 'meal' || m.kind === 'custom');
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
        {band}
        {rain}
        {area && <path d={area} fill="rgba(201, 123, 71, 0.16)" />}
        {line && <path d={line} fill="none" stroke="var(--terracotta-500, #C97B47)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />}
        {breaks.map((m, i) => (
          <line key={`p${i}`} x1={x(m.dist)} x2={x(m.dist)} y1={PROF_T} y2={PROF_B} stroke="var(--stone-600, #5C5447)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    );
  }, [samples, wx, points, milestones, n, x, d0, d1]);

  const axis = useMemo(() => {
    if (n < 2) return [];
    const fr = compact ? [0, 1] : [0, 0.25, 0.5, 0.75, 1];
    return fr.map((f) => samples[nearestSampleIndex(samples, d0 + f * span)]);
  }, [samples, compact, n, d0, span]);

  // ----- pointer on the whole track -----
  const fromClientX = useCallback((cx: number) => {
    const el = trackRef.current; if (!el || n < 1) return;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (cx - r.left) / Math.max(1, r.width)));
    onIdx(nearestSampleIndex(samples, d0 + f * span));
  }, [n, samples, d0, span, onIdx]);
  const [playing, setPlaying] = useState(false);
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    setPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    fromClientX(e.clientX);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => { if (e.buttons) fromClientX(e.clientX); };

  // ----- play: one sample per tick, stops at the finish -----
  const idxRef = useRef(idx);
  idxRef.current = idx;
  useEffect(() => {
    if (!playing) return;
    if (idxRef.current >= n - 1) onIdx(0);
    const id = setInterval(() => {
      if (idxRef.current >= n - 1) { setPlaying(false); return; }
      onIdx(idxRef.current + 1);
    }, PLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, n, onIdx]);

  if (n < 2) return null;
  const cur = samples[Math.min(idx, n - 1)];
  const left = `${(x(cur.dist) / VW) * 100}%`;

  return (
    <div className={`te-slider${compact ? ' is-compact' : ''}`}>
      <div className="te-s-head">
        <div className="te-s-readout">{readout}</div>
        <div className="te-s-btns">
          <button type="button" className="te-ib" aria-label="Vorheriger Punkt" onClick={() => { setPlaying(false); onIdx(Math.max(0, idx - 1)); }}>‹</button>
          <button type="button" className="te-ib te-ib--play" aria-label={playing ? 'Anhalten' : 'Tour abspielen'} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>
          <button type="button" className="te-ib" aria-label="Nächster Punkt" onClick={() => { setPlaying(false); onIdx(Math.min(n - 1, idx + 1)); }}>›</button>
        </div>
      </div>
      <div
        ref={trackRef}
        className="te-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        title="Werte gelten für den nächstgelegenen Rechenpunkt der Strecke — zwischen den Punkten wird nicht interpoliert."
      >
        {svg}
        {wx && events.map((e, i) => (
          <span key={i} className="te-evm" style={{ left: `${(x(e.dist) / VW) * 100}%` }} title={`${clock(e.etaMs)} · km ${kmStr(e.dist)}: ${e.text}`} />
        ))}
        <span className="te-thumb" style={{ left }} aria-hidden="true"><i className="te-thumb-ln" /><i className="te-thumb-kn" /></span>
        <input
          type="range"
          className="te-range"
          min={0}
          max={n - 1}
          step={1}
          value={Math.min(idx, n - 1)}
          aria-label="Position auf der Route"
          aria-valuetext={`km ${kmStr(cur.dist)}, ${clock(cur.etaMs)} Uhr`}
          onChange={(e) => { setPlaying(false); onIdx(Number(e.currentTarget.value)); }}
        />
      </div>
      <div className="te-s-axis">
        {axis.map((s, i) => <span key={i}>{clock(s.etaMs)} · {kmStr(s.dist)} km</span>)}
      </div>
    </div>
  );
}

export default memo(RouteSlider);
