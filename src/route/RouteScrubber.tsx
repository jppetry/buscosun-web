/**
 * Zeit-Scrubber (Mockup 04 + 06): gekoppeltes Höhenprofil + Detail-Panel.
 *
 * Ein ziehbarer Marker entlang der Distanz setzt eine Position; daraus folgen
 * Ort (interpoliert über die Track-Punkte), Ankunftszeit und das Wetter am
 * nächsten Sample. Das Höhenprofil trägt Wetter-Overlays (Niederschlag,
 * Föhn-Zone, Schneefallgrenze, Pausen). Die Scrub-Position wird über `onPos`
 * nach oben gemeldet (Live-Marker auf der Karte). Play-Animation + Pfeiltasten.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { SampleETA, Milestone } from './tourTiming';
import type { TourPoint } from './tourTrack';
import { WeatherIcon, pickWeatherCondition } from '../components/WeatherIcon';
import { bearingDeg, headwindComponentMps } from './windEffect';
import { fmt1, clock, UvBadge, RadarBadge } from './tourUi';
import { IconWarning, IconWind, IconPlay, IconPause, IconStepBack, IconStepForward, IconBulb } from './routeIcons';

interface Props {
  points: TourPoint[];
  samples: SampleETA[];                 // angereicherte displaySamples
  milestones: Milestone[];
  startMs: number;
  onPos?: (lat: number, lon: number) => void;
  /** Gesteuerte Scrub-Distanz (m) — koppelt mit dem Wetter-Strip. Sonst intern. */
  dist?: number;
  onDist?: (distM: number) => void;
}

const VW = 1000, VH = 140, PAD_T = 14, PAD_B = 8;

export default function RouteScrubber({ points, samples, milestones, startMs, onPos, dist: distProp, onDist }: Props) {
  const totalM = points.length ? points[points.length - 1].dist : 0;
  const [internalDist, setInternalDist] = useState(totalM * 0.5);
  const dist = distProp ?? internalDist;
  const setDist = useCallback((next: number | ((d: number) => number)) => {
    const nd = typeof next === 'function' ? (next as (d: number) => number)(dist) : next;
    setInternalDist(nd);
    onDist?.(nd);
  }, [dist, onDist]);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Höhen-Range für die Profil-Skala.
  const eleRange = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const p of points) if (Number.isFinite(p.ele)) { mn = Math.min(mn, p.ele); mx = Math.max(mx, p.ele); }
    if (!Number.isFinite(mn)) { mn = 0; mx = 1; }
    if (mx - mn < 1) mx = mn + 1;
    return { mn, mx };
  }, [points]);

  const x = useCallback((d: number) => (totalM > 0 ? (d / totalM) * VW : 0), [totalM]);
  const y = useCallback((ele: number) => PAD_T + (1 - (ele - eleRange.mn) / (eleRange.mx - eleRange.mn)) * (VH - PAD_T - PAD_B), [eleRange]);

  // Profil-Pfad.
  const elevPath = useMemo(() => {
    const pts = points.filter((p) => Number.isFinite(p.ele));
    if (pts.length < 2) return { line: '', area: '' };
    let line = '';
    for (let i = 0; i < pts.length; i++) line += `${i ? 'L' : 'M'} ${x(pts[i].dist).toFixed(1)} ${y(pts[i].ele).toFixed(1)} `;
    const area = `${line} L ${VW} ${VH} L 0 ${VH} Z`;
    return { line: line.trim(), area };
  }, [points, x, y]);

  // Position (lat/lon/ele) an der Scrub-Distanz interpolieren.
  const pos = useMemo(() => posAt(points, dist), [points, dist]);
  useEffect(() => { if (pos && onPos) onPos(pos.lat, pos.lon); }, [pos, onPos]);

  // Nächstes Sample (Wetter) + interpolierte ETA.
  const withW = useMemo(() => samples.filter((s) => s.weather != null), [samples]);
  const sample = useMemo(() => nearestByDist(withW, dist), [withW, dist]);
  const etaMs = useMemo(() => etaAt(samples, dist, startMs), [samples, dist, startMs]);

  // Travel-Bearing an der Position → Rücken/Gegenwind.
  const travelBearing = useMemo(() => bearingAt(points, dist), [points, dist]);

  // ----- Interaktion -----
  const setFromClientX = useCallback((clientX: number) => {
    const el = canvasRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    setDist(frac * totalM);
  }, [totalM]);

  const onPointerDown = (e: ReactPointerEvent) => {
    setPlaying(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.buttons === 0) return;
    setFromClientX(e.clientX);
  };

  // Tastatur ← → (Fein), Leertaste = Play.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { setPlaying(false); setDist((d) => Math.max(0, d - totalM / 100)); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { setPlaying(false); setDist((d) => Math.min(totalM, d + totalM / 100)); e.preventDefault(); }
      else if (e.key === ' ') { setPlaying((p) => !p); e.preventDefault(); }
    };
    const el = canvasRef.current;
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [totalM]);

  // Play-Animation (gesamte Tour in ~12 s).
  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = 0; let stop = false;
    const tick = (t: number) => {
      if (last) setDist((d) => {
        const nd = d + (totalM / 12000) * (t - last);
        if (nd >= totalM) { stop = true; return totalM; }
        return nd;
      });
      last = t;
      if (stop) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalM]);

  if (totalM <= 0 || withW.length < 2 || !sample) return null;
  const w = sample.weather!;

  // Overlays: Niederschlags-Bänder + Föhn-Zone.
  const precipBands = withW.filter((s) => (s.weather?.precipitationMmH ?? 0) > 0.1);
  const maxRate = Math.max(1, ...precipBands.map((s) => s.weather!.precipitationMmH ?? 0));
  const foehnBands = withW.filter((s) => s.weather?.foehn?.isFoehn);

  const snowLineY = w.snowLineM != null && w.snowLineM >= eleRange.mn && w.snowLineM <= eleRange.mx ? y(w.snowLineM) : null;
  const cond = pickWeatherCondition(w.cloudCoverPct ?? 0, w.precipitationMmH ?? 0, new Date(etaMs));
  const wind = w.windSpeedMps ?? 0;
  const comp = w.windDirectionDeg != null ? headwindComponentMps(travelBearing, w.windDirectionDeg, wind) : 0;
  const windRel = wind < 0.5 ? '' : comp > 0.5 ? 'Rückenwind' : comp < -0.5 ? 'Gegenwind' : 'Seitenwind';
  const snowRel = w.snowLineM != null && pos
    ? (w.snowLineM - pos.ele >= 0 ? `${Math.round(w.snowLineM - pos.ele)} m über dir` : `${Math.round(pos.ele - w.snowLineM)} m unter dir`)
    : null;

  const sx = x(dist);

  return (
    <section className="rt-section">
      <span className="rt-eyebrow">Zeit-Scrubber · zieh den Marker</span>
      <div className="rt-cols rt-cols-2" style={{ marginTop: '0.85rem' }}>
        {/* Detail-Panel */}
        <div className="rt-card rt-detail">
          <span className="rt-eyebrow">Deine Position um {clock(etaMs)}</span>
          <div className="rt-detail-temp">{w.temperatureC != null ? `${fmt1(w.temperatureC)} °C` : '—'}</div>
          <div className="rt-detail-sub">
            {w.apparentTempC != null && `gefühlt ${fmt1(w.apparentTempC)} °C · `}
            {(dist / 1000).toFixed(1).replace('.', ',')} km{pos ? ` · ${Math.round(pos.ele)} m` : ''}
          </div>

          <div className="rt-detail-grid">
            <Cell label="Niederschlag" v={w.precipitationMmH != null ? `${fmt1(w.precipitationMmH)} mm/h` : '—'}
              s={w.precipitationSource === 'radar' ? <RadarBadge /> : w.precipitationMmH ? 'NWP' : undefined} />
            <Cell label="Wind · Böen" v={`${fmt1(wind)}${w.gustMps != null ? ` · ${fmt1(w.gustMps)}` : ''} m/s`}
              s={<>{w.windDirectionDeg != null && <WindArrow deg={w.windDirectionDeg} />}{w.windDirectionDeg != null ? `${compass(w.windDirectionDeg)}${windRel ? ` · ${windRel}` : ''}` : ''}</>} />
            <Cell label="Bewölkung" v={w.cloudCoverPct != null ? `${Math.round(w.cloudCoverPct)} %` : '—'} s={cloudWord(w.cloudCoverPct)} />
            <Cell label="UV-Index" v={w.uvIndex != null ? fmt1(w.uvIndex) : '—'}
              s={w.uvIndex != null && w.uvIndex > 0 ? <UvBadge uv={w.uvIndex} /> : undefined} />
            <Cell label="Schneefallgrenze" v={w.snowLineM != null ? `${Math.round(w.snowLineM)} m` : '—'} s={snowRel ?? undefined} />
            <Cell label="Luftfeuchte" v={w.relativeHumidityPct != null ? `${Math.round(w.relativeHumidityPct)} %` : '—'} />
          </div>

          {w.warnings.length > 0 && (
            <div className="rt-sub-card rt-sub-warn">
              <strong style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><IconWarning size={15} /> {w.warnings[0].event || w.warnings[0].headline}</strong>
              <div className="rt-banner-line" style={{ marginTop: '0.2rem' }}>
                DWD · Level {w.warnings[0].level} · bis {clock(w.warnings[0].expiresMs)}
              </div>
            </div>
          )}
          {w.foehn?.isFoehn && (
            <div className="rt-sub-card rt-sub-foehn">
              <strong style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><IconWind size={15} /> Föhn-Lage · Score {fmt1(w.foehn.score)}</strong>
              <div className="rt-banner-line" style={{ marginTop: '0.2rem' }}>{w.foehn.reasons.join(', ')} <em>(heuristisch)</em></div>
            </div>
          )}
        </div>

        {/* Profil-Scrubber */}
        <div className="rt-card rt-scrubber">
          <div className="rt-scrub-head">
            <span className="rt-eyebrow">Höhenprofil</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--stone-600)' }}>
              <WeatherIcon condition={cond} size={20} /> {(dist / 1000).toFixed(1).replace('.', ',')} km
            </span>
          </div>

          {/* km-Sprung-Chips an den Milestones */}
          <div className="rt-scrub-chips">
            {milestones.map((m, i) => {
              const active = Math.abs(m.dist - dist) < totalM / 60;
              return (
                <button key={i} type="button" className={`rt-scrub-chip${active ? ' is-active' : ''}`} onClick={() => { setPlaying(false); setDist(m.dist); }}>
                  {(m.dist / 1000).toFixed(1).replace('.', ',')} km
                </button>
              );
            })}
          </div>

          <div ref={canvasRef} className="rt-scrub-canvas" tabIndex={0} role="slider"
            aria-label="Position entlang der Tour" aria-valuemin={0} aria-valuemax={Math.round(totalM)} aria-valuenow={Math.round(dist)}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
            <svg viewBox={`0 ${-22} ${VW} ${VH + 44}`} preserveAspectRatio="none" style={{ width: '100%', height: 170, display: 'block', overflow: 'visible' }}>
              {/* Föhn-Zonen */}
              {foehnBands.map((s, i) => <rect key={`f${i}`} x={x(s.dist) - 8} y={0} width={16} height={VH} fill="#D4A373" opacity={0.12} />)}
              {/* Niederschlags-Bänder */}
              {precipBands.map((s, i) => (
                <rect key={`p${i}`} x={x(s.dist) - 7} y={0} width={14} height={VH} fill="#3A6FA8" opacity={Math.min(0.45, 0.08 + 0.4 * ((s.weather!.precipitationMmH ?? 0) / maxRate))} />
              ))}
              {/* Höhen-Fläche + Linie */}
              <path d={elevPath.area} fill="#E0D6BE" opacity={0.6} />
              <path d={elevPath.line} fill="none" stroke="#8B7355" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
              {/* Schneefallgrenze */}
              {snowLineY != null && <line x1={0} y1={snowLineY} x2={VW} y2={snowLineY} stroke="#9ab8cf" strokeWidth={1.4} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
              {/* Pausen-/Mahlzeit-Marker */}
              {milestones.filter((m) => m.kind === 'rest' || m.kind === 'meal' || m.kind === 'custom').map((m, i) => (
                <rect key={`m${i}`} x={x(m.dist) - 3} y={-3} width={6} height={6} rx={m.kind === 'meal' ? 0 : 1.5} fill={m.kind === 'meal' ? '#C97B47' : '#D4A373'} />
              ))}
              {/* Scrubber-Linie + Handle */}
              <line x1={sx} y1={-12} x2={sx} y2={VH} stroke="#C97B47" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
              <g transform={`translate(${sx}, -16)`}>
                <rect x={-30} y={-13} width={60} height={20} rx={10} fill="#C97B47" />
                <text y={1} fontSize={12} fontWeight={700} fill="#FAF6EA" textAnchor="middle">{clock(etaMs)}</text>
              </g>
              <circle cx={sx} cy={VH} r={11} fill="#C97B47" />
              <g stroke="#FAF6EA" strokeWidth={1.6} strokeLinecap="round">
                <line x1={sx - 3} y1={VH - 3} x2={sx + 3} y2={VH - 3} /><line x1={sx - 3} y1={VH} x2={sx + 3} y2={VH} /><line x1={sx - 3} y1={VH + 3} x2={sx + 3} y2={VH + 3} />
              </g>
            </svg>
          </div>

          <div className="rt-scrub-axis">
            <span>{clock(startMs)} · 0 km</span>
            {snowLineY == null && w.snowLineM != null && <span style={{ color: 'var(--stone-500)' }}>Schneefallgrenze {Math.round(w.snowLineM)} m</span>}
            <span>{clock(etaAt(samples, totalM, startMs))} · {(totalM / 1000).toFixed(1).replace('.', ',')} km</span>
          </div>

          <div className="rt-scrub-controls">
            <button type="button" className="rt-scrub-btn" title="−1 km" onClick={() => { setPlaying(false); setDist((d) => Math.max(0, d - 1000)); }}><IconStepBack size={17} /></button>
            <button type="button" className="rt-scrub-btn rt-scrub-play" title="Tour abspielen (Leertaste)" onClick={() => setPlaying((p) => !p)}>{playing ? <IconPause size={18} /> : <IconPlay size={18} />}</button>
            <button type="button" className="rt-scrub-btn" title="+1 km" onClick={() => { setPlaying(false); setDist((d) => Math.min(totalM, d + 1000)); }}><IconStepForward size={17} /></button>
          </div>

          <div className="rt-scrub-hint"><IconBulb size={14} /> Zieh den Marker oder tippe einen km-Chip an. <em>Pfeiltasten ← → fein · Leertaste startet die Tour.</em></div>
        </div>
      </div>
    </section>
  );
}

function Cell({ label, v, s }: { label: string; v: string; s?: ReactNode }) {
  return (
    <div className="rt-detail-cell">
      <div className="rt-stat-label">{label}</div>
      <div className="v">{v}</div>
      {s != null && s !== '' && <div className="s">{s}</div>}
    </div>
  );
}

function WindArrow({ deg }: { deg: number }) {
  // Pfeil zeigt in Strömungsrichtung (woher + 180°).
  return (
    <svg className="rt-windarrow" width={14} height={14} viewBox="0 0 14 14" style={{ transform: `rotate(${(deg + 180) % 360}deg)` }} aria-hidden="true">
      <line x1="7" y1="12" x2="7" y2="2" stroke="#4f627e" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M 4 5 L 7 2 L 10 5" fill="none" stroke="#4f627e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---- geo/time helpers ---- */
function posAt(points: TourPoint[], dist: number): { lat: number; lon: number; ele: number } | null {
  if (points.length === 0) return null;
  if (dist <= 0) return { lat: points[0].lat, lon: points[0].lon, ele: points[0].ele };
  const last = points[points.length - 1];
  if (dist >= last.dist) return { lat: last.lat, lon: last.lon, ele: last.ele };
  for (let i = 1; i < points.length; i++) {
    if (points[i].dist >= dist) {
      const a = points[i - 1], b = points[i];
      const span = b.dist - a.dist;
      const f = span > 0 ? (dist - a.dist) / span : 0;
      return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, ele: a.ele + (b.ele - a.ele) * f };
    }
  }
  return { lat: last.lat, lon: last.lon, ele: last.ele };
}
function bearingAt(points: TourPoint[], dist: number): number {
  if (points.length < 2) return 0;
  let i = 1;
  while (i < points.length - 1 && points[i].dist < dist) i++;
  return bearingDeg(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
}
function nearestByDist(samples: SampleETA[], dist: number): SampleETA | null {
  let best: SampleETA | null = null, bd = Infinity;
  for (const s of samples) { const d = Math.abs(s.dist - dist); if (d < bd) { bd = d; best = s; } }
  return best;
}
function etaAt(samples: SampleETA[], dist: number, startMs: number): number {
  const s = samples;
  if (s.length === 0) return startMs;
  if (dist <= s[0].dist) return s[0].etaMs;
  const last = s[s.length - 1];
  if (dist >= last.dist) return last.etaMs;
  for (let i = 1; i < s.length; i++) {
    if (s[i].dist >= dist) {
      const a = s[i - 1], b = s[i]; const span = b.dist - a.dist;
      const f = span > 0 ? (dist - a.dist) / span : 0;
      return a.etaMs + (b.etaMs - a.etaMs) * f;
    }
  }
  return last.etaMs;
}
function compass(deg: number): string {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}
function cloudWord(pct: number | null): string {
  if (pct == null) return '';
  if (pct < 13) return 'wolkenlos'; if (pct < 38) return 'leicht bewölkt';
  if (pct < 63) return 'wechselnd'; if (pct < 88) return 'überwiegend bewölkt'; return 'bedeckt';
}
