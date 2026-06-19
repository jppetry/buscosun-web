/**
 * RadarTimeline — die Zeitachse mit dem ehrlichen Messung↔Vorhersage-Bruch.
 *
 * Das wichtigste Differenzierungsmerkmal (§2/§15 #1): gemessene Frames links
 * (durchgezogen), Vorhersage rechts (gestrichelt, mit zunehmender Konfidenz-
 * Verblassung) — getrennt durch eine deutliche „⟶ Vorhersage"-Marke bei
 * „jetzt". Controlled-Component: Abspiel-Engine liegt im Radar-Block (NowcastRadarMap).
 */

import { useCallback, useRef } from 'react';
import type { RadarStack } from './radarFrames';
import { IconPlay, IconPause, IconStepBack, IconStepForward, IconCrosshair, IconLoop } from './radarIcons';

interface Props {
  stack: RadarStack;
  framePos: number;
  playing: boolean;
  speed: number;
  loop: boolean;
  /** Regenintensität (mm/h) je Frame am Standort — zeichnet das Profil in die Leiste. */
  intensities?: number[];
  onScrub: (pos: number) => void;
  onTogglePlay: () => void;
  onStep: (delta: number) => void;
  onJumpNow: () => void;
  onSpeed: (s: number) => void;
  onToggleLoop: () => void;
}

const SPEEDS = [0.5, 1, 2];

/** Logarithmische Profilhöhe (0..1): hält Niesel sichtbar (Mindesthöhe), deckelt Starkregen. */
function profileHeight(mmH: number, vmax: number): number {
  if (mmH < 0.05) return 0;
  const t = Math.log10(1 + mmH) / Math.log10(1 + vmax);
  return Math.min(1, Math.max(0.12, t));
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function fmtRel(leadMin: number): string {
  if (leadMin === 0) return 'jetzt';
  const a = Math.abs(leadMin);
  const h = Math.floor(a / 60), m = a % 60;
  const body = h > 0 ? `${h} h ${m ? m + ' min' : ''}`.trim() : `${m} min`;
  return leadMin < 0 ? `vor ${body}` : `in ${body}`;
}

export default function RadarTimeline({
  stack, framePos, playing, speed, loop, intensities,
  onScrub, onTogglePlay, onStep, onJumpNow, onSpeed, onToggleLoop,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const n = stack.frames.length;
  const maxIdx = Math.max(1, n - 1);
  const cur = stack.frames[Math.max(0, Math.min(n - 1, Math.round(framePos)))];
  const nowFrac = stack.nowIndex / maxIdx;
  const thumbFrac = framePos / maxIdx;

  // Regenintensitäts-Profil in die Leiste rechnen (Fläche + Linie, gemessen
  // durchgezogen / Vorhersage gestrichelt). vmax dynamisch, damit auch leichter
  // Regen sichtbar ist, ohne dass Starkregen die Leiste sprengt.
  const profile = (() => {
    const vals = intensities && intensities.length === n ? intensities : null;
    if (!vals) return null;
    const peak = Math.max(...vals);
    if (peak < 0.05) return { peak: 0, area: '', lineMeas: '', lineFc: '' };
    const W = 1000, H = 100;
    const vmax = Math.max(3.5, peak);
    const x = (i: number) => (i / maxIdx) * W;
    const y = (mmH: number) => H - profileHeight(mmH, vmax) * H;
    const pts = vals.map((v, i) => [x(i), y(v)] as const);
    const area = `M 0 ${H} ` + pts.map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ` L ${W} ${H} Z`;
    const ni = Math.max(0, Math.min(n - 1, stack.nowIndex));
    const seg = (from: number, to: number) =>
      pts.slice(from, to + 1).map((p, k) => `${k ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    return { peak, area, lineMeas: seg(0, ni), lineFc: seg(ni, n - 1) };
  })();

  const posFromEvent = useCallback((clientX: number): number => {
    const el = trackRef.current; if (!el) return framePos;
    const r = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return f * maxIdx;
  }, [framePos, maxIdx]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onScrub(posFromEvent(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    onScrub(posFromEvent(e.clientX));
  };

  return (
    <div className="rdr-timeline">
      <div className="rdr-tl-top">
        <div className="rdr-tl-stamp">
          <strong>{cur ? fmtClock(cur.timeMs) : '—'}</strong>
          {cur && (
            <span className={`rdr-tl-status ${cur.measured ? 'is-meas' : 'is-fc'}`}>
              {fmtRel(cur.leadMinutes)} · {cur.measured ? 'gemessen' : 'Vorhersage'}
            </span>
          )}
        </div>
        <div className="rdr-tl-legend2">
          {profile && profile.peak >= 0.05 && (
            <span className="rdr-tl-peak"><i className="rdr-tl-peak-drop" /> Spitze {profile.peak.toFixed(profile.peak >= 1 ? 0 : 1).replace('.', ',')} mm/h</span>
          )}
          <span className="rdr-tl-key"><i className="rdr-k-meas" /> gemessen</span>
          <span className="rdr-tl-key"><i className="rdr-k-fc" /> Vorhersage</span>
        </div>
      </div>

      <div
        ref={trackRef}
        className="rdr-tl-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-label="Radar-Zeitpunkt"
        aria-valuemin={0}
        aria-valuemax={maxIdx}
        aria-valuenow={Math.round(framePos)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); onStep(-1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); onStep(1); }
        }}
      >
        {/* Regenintensitäts-Profil — Fläche + Linie (gemessen solide / Vorhersage gestrichelt) */}
        {profile && profile.area && (
          <svg className="rdr-tl-profile" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="rdrTlRain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3A6FA8" stopOpacity="0.5" />
                <stop offset="1" stopColor="#3A6FA8" stopOpacity="0.04" />
              </linearGradient>
            </defs>
            <path d={profile.area} fill="url(#rdrTlRain)" />
            {profile.lineMeas && <path d={profile.lineMeas} fill="none" stroke="#2C5A86" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            {profile.lineFc && <path d={profile.lineFc} fill="none" stroke="#3A6FA8" strokeWidth="2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          </svg>
        )}
        {/* gemessener Bereich (links) — Grundlinie unten */}
        <div className="rdr-tl-fill-meas" style={{ width: `${nowFrac * 100}%` }} />
        {/* Vorhersage-Bereich (rechts), konfidenz-verblassend */}
        <div className="rdr-tl-fill-fc" style={{ left: `${nowFrac * 100}%`, right: 0 }} />
        {/* Frame-Ticks */}
        {stack.frames.map((f, i) => {
          const lead = f.leadMinutes;
          const fade = lead <= 0 ? 1 : Math.max(0.25, 1 - lead / (stack.skillMin * 1.5 || 180));
          return (
            <span
              key={i}
              className={`rdr-tl-tick${f.measured ? ' is-meas' : ' is-fc'}`}
              style={{ left: `${(i / maxIdx) * 100}%`, opacity: fade }}
            />
          );
        })}
        {/* „jetzt"-Bruchlinie (Mess-/Vorhersage-Grenze) */}
        <span className="rdr-tl-break" style={{ left: `${nowFrac * 100}%` }} />
        {/* Thumb */}
        <span className="rdr-tl-thumb" style={{ left: `${thumbFrac * 100}%` }} />
      </div>

      {/* „jetzt"-Marker in eigener Spur — zeigt sauber auf die Grenze, ohne das Zeit-Label zu überlappen */}
      <div className="rdr-tl-nowlane">
        <span className="rdr-tl-nowmark" style={{ left: `${Math.max(3.5, Math.min(96.5, nowFrac * 100))}%` }}>
          <i className="rdr-tl-nowmark-tip" />
          <span className="rdr-tl-nowmark-txt">jetzt</span>
        </span>
      </div>

      <div className="rdr-tl-controls">
        <button type="button" className="rdr-tl-btn" onClick={() => onStep(-1)} title="Ein Frame zurück" aria-label="Ein Frame zurück"><IconStepBack size={16} /></button>
        <button type="button" className="rdr-tl-btn rdr-tl-play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Abspielen'} aria-label={playing ? 'Pause' : 'Abspielen'}>
          {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>
        <button type="button" className="rdr-tl-btn" onClick={() => onStep(1)} title="Ein Frame vor" aria-label="Ein Frame vor"><IconStepForward size={16} /></button>
        <button type="button" className="rdr-tl-btn rdr-tl-now" onClick={onJumpNow} title="Zurück zu jetzt"><IconCrosshair size={15} /> Jetzt</button>
        <div className="rdr-tl-speeds" role="group" aria-label="Geschwindigkeit">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={`rdr-tl-speed${speed === s ? ' is-active' : ''}`} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button type="button" className={`rdr-tl-btn rdr-tl-loop${loop ? ' is-active' : ''}`} onClick={onToggleLoop} title="Schleife" aria-label="Schleife umschalten"><IconLoop size={16} /></button>
      </div>
    </div>
  );
}
