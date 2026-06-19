/**
 * Strecken-Informationen aus dem aufbereiteten {@link TourTrack}: Kennzahlen-
 * Raster, Höhenprofil und Hinweise zur Aufbereitung (Gelände, DEM-Höhen,
 * Punkt-Reduktion).
 */

import { useMemo } from 'react';
import type { TourTrack } from './tourTrack';

interface Props {
  track: TourTrack;
}

export default function RouteSummary({ track }: Props) {
  const { meta } = track;

  // Sechs Kennzahlen wie Mockup 01 (Track-Punkte stehen im „161 → 23"-Chip,
  // Dauer folgt erst nach der Zeitplanung).
  const items: Array<{ label: string; value: string }> = [
    { label: 'Distanz', value: `${(meta.totalDistanceM / 1000).toFixed(1).replace('.', ',')} km` },
    { label: 'Aufstieg', value: meta.elevationAvailable ? `${meta.ascentM} hm` : '—' },
    { label: 'Abstieg', value: meta.elevationAvailable ? `${meta.descentM} hm` : '—' },
    { label: 'Höchster Punkt', value: meta.maxEleM != null ? `${meta.maxEleM} m` : '—' },
    { label: 'Tiefster Punkt', value: meta.minEleM != null ? `${meta.minEleM} m` : '—' },
    { label: 'Wetter-Punkte', value: meta.sampleCount.toLocaleString('de-DE') },
  ];

  return (
    <div className="route-summary">
      <div className="route-summary-main">
        <div className="route-summary-stats">
          <dl className="route-stats">
            {items.map((it) => (
              <div key={it.label} className="route-stat">
                <dt>{it.label}</dt>
                <dd>{it.value}</dd>
              </div>
            ))}
          </dl>

          <div className="route-prep">
            <span className="route-chip-info">Gelände: {meta.terrain}</span>
            {meta.elevationEnriched && (
              <span className="route-chip-info">Höhen aus DEM ergänzt</span>
            )}
            <span className="route-chip-info">
              {meta.pointCount.toLocaleString('de-DE')} → {meta.sampleCount} Wetter-Punkte
            </span>
          </div>
        </div>

        <ElevationProfile track={track} />
      </div>

      {meta.startTime != null && (
        <p className="route-time-range">
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

    const W = 600, H = 120, padY = 8;
    let min = Infinity, max = -Infinity;
    for (const p of pts) { if (p.ele < min) min = p.ele; if (p.ele > max) max = p.ele; }
    const span = Math.max(1, max - min);

    const x = (d: number) => (d / total) * W;
    const y = (e: number) => padY + (1 - (e - min) / span) * (H - 2 * padY);

    let line = `M ${x(0).toFixed(1)} ${y(pts[0].ele).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) line += ` L ${x(pts[i].dist).toFixed(1)} ${y(pts[i].ele).toFixed(1)}`;
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { W, H, line, area, max: Math.round(max), totalKm: total / 1000 };
  }, [track]);

  if (!profile) return null;

  return (
    <figure className="route-profile">
      <figcaption>Höhenprofil{track.meta.elevationEnriched ? ' (DEM)' : ''}</figcaption>
      <svg viewBox={`0 0 ${profile.W} ${profile.H}`} preserveAspectRatio="none" className="route-profile-svg" aria-hidden="true">
        <path d={profile.area} fill="var(--sage-50, #f0f4ea)" />
        <path d={profile.line} fill="none" stroke="var(--sage-600, #7a9466)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="route-profile-axis">
        <span>0 km</span>
        <span>{profile.max} m</span>
        <span>{profile.totalKm.toFixed(1).replace('.', ',')} km</span>
      </div>
    </figure>
  );
}

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
