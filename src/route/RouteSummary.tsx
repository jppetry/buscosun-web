/**
 * Strecken-Vorschau aus dem aufbereiteten {@link TourTrack} — Command-Deck (T2/T14):
 * vier Primär-Kennzahlen (Distanz/Aufstieg/Abstieg/Gelände), Höhenprofil und
 * Detail-Chips (höchster/tiefster Punkt, Wetter-Punkte, DEM-Aufbereitung).
 * Kein Informationsverlust — nur nach Vorlage angeordnet.
 */

import { useMemo } from 'react';
import type { TourTrack } from './tourTrack';

interface Props {
  track: TourTrack;
}

function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export default function RouteSummary({ track }: Props) {
  const { meta } = track;

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Distanz', value: `${(meta.totalDistanceM / 1000).toFixed(1).replace('.', ',')} km` },
    { label: 'Aufstieg', value: meta.elevationAvailable ? `${meta.ascentM} hm` : '—' },
    { label: 'Abstieg', value: meta.elevationAvailable ? `${meta.descentM} hm` : '—' },
    { label: 'Gelände', value: cap(meta.terrain) },
  ];

  return (
    <div className="rd-summary">
      <div className="rd-statgrid">
        {stats.map((s) => (
          <div key={s.label} className="rd-stat">
            <div className="rd-stat-label">{s.label}</div>
            <div className="rd-stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <ElevationProfile track={track} />

      <div className="rd-preview-details">
        {meta.maxEleM != null && <span className="rd-chip-info">Höchster Punkt: {meta.maxEleM} m</span>}
        {meta.minEleM != null && <span className="rd-chip-info">Tiefster Punkt: {meta.minEleM} m</span>}
        <span className="rd-chip-info">{meta.sampleCount.toLocaleString('de-DE')} Wetter-Punkte</span>
        {/* „ergänzt" und „ersetzt" sind zwei verschiedene Auskünfte: einmal
            brachte die Datei keine Höhen mit, einmal brachte sie welche, die
            dieses Gelände nicht beschreiben (`audit/route-3d.md` §19.2). */}
        {meta.elevationSource === 'dem-filled' && <span className="rd-chip-info">Höhen aus DEM ergänzt</span>}
        {meta.elevationSource === 'dem-replaced' && (
          <span className="rd-chip-info">
            Höhen aus DEM ersetzt{meta.elevationDeltaM != null ? ` — Datei wich ${Math.round(meta.elevationDeltaM)} m ab` : ''}
          </span>
        )}
        <span className="rd-chip-info">{meta.pointCount.toLocaleString('de-DE')} → {meta.sampleCount} Punkte</span>
      </div>

      {meta.startTime != null && (
        <p className="rd-time-range">
          Original-Zeit: {formatStamp(meta.startTime)}
          {meta.endTime != null && meta.endTime !== meta.startTime ? ` – ${formatStamp(meta.endTime)}` : ''}
        </p>
      )}
    </div>
  );
}

function ElevationProfile({ track }: { track: TourTrack }) {
  const profile = useMemo(() => {
    if (!track.meta.elevationAvailable) return null;
    const pts = track.points;
    if (pts.length < 2) return null;
    const total = pts[pts.length - 1].dist;
    if (total <= 0) return null;

    const W = 1180, H = 200, padY = 12;
    let min = Infinity, max = -Infinity;
    for (const p of pts) { if (p.ele < min) min = p.ele; if (p.ele > max) max = p.ele; }
    const span = Math.max(1, max - min);

    const x = (d: number) => (d / total) * W;
    const y = (e: number) => padY + (1 - (e - min) / span) * (H - 2 * padY);

    let line = `M ${x(0).toFixed(1)} ${y(pts[0].ele).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) line += ` L ${x(pts[i].dist).toFixed(1)} ${y(pts[i].ele).toFixed(1)}`;
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return {
      W, H, line, area,
      startY: y(pts[0].ele).toFixed(1), endY: y(pts[pts.length - 1].ele).toFixed(1),
      min: Math.round(min), max: Math.round(max), totalKm: total / 1000,
    };
  }, [track]);

  if (!profile) return null;
  const nn = (n: number) => n.toLocaleString('de-DE');

  return (
    <div className="rd-elev">
      <div className="rd-elev-head">
        <span>Höhenprofil{track.meta.elevationEnriched ? ' (DEM)' : ''}</span>
        <span>{nn(profile.min)} m → {nn(profile.max)} m ü. NN</span>
      </div>
      <svg viewBox={`0 0 ${profile.W} ${profile.H}`} preserveAspectRatio="none" aria-hidden="true">
        <g stroke="var(--border-default)" strokeWidth="1">
          <line x1="0" y1={profile.H * 0.25} x2={profile.W} y2={profile.H * 0.25} />
          <line x1="0" y1={profile.H * 0.5} x2={profile.W} y2={profile.H * 0.5} />
          <line x1="0" y1={profile.H * 0.75} x2={profile.W} y2={profile.H * 0.75} />
        </g>
        <path d={profile.area} fill="rgba(201,123,71,.14)" />
        <path d={profile.line} fill="none" stroke="var(--terracotta-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx="0" cy={profile.startY} r="4" fill="var(--sage-600)" />
        <circle cx={profile.W} cy={profile.endY} r="4" fill="var(--rd-red)" />
      </svg>
      <div className="rd-elev-axis">
        <span>Start · {nn(profile.min)} m</span>
        <span>Ziel · {nn(profile.max)} m</span>
      </div>
    </div>
  );
}

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
