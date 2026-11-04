/**
 * Strecken-Vorschau aus dem aufbereiteten {@link TourTrack} — Command-Deck (T2/T14):
 * vier Primär-Kennzahlen (Distanz/Aufstieg/Abstieg/Gelände), Höhenprofil und
 * Detail-Chips (höchster/tiefster Punkt, Wetter-Punkte, DEM-Aufbereitung).
 * Kein Informationsverlust — nur nach Vorlage angeordnet.
 */

import { lazy, Suspense, useMemo } from 'react';
import type { TourTrack } from './tourTrack';

/** Das Profil hängt an nivo: eigener Chunk. */
const RouteElevationChart = lazy(() => import('./RouteElevationChart'));

interface Props {
  track: TourTrack;
}

function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/** Die vier Primär-Kennzahlen (Dock der Vorschau). */
export function RouteStats({ track }: Props) {
  const { meta } = track;

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Distanz', value: `${(meta.totalDistanceM / 1000).toFixed(1).replace('.', ',')} km` },
    { label: 'Aufstieg', value: meta.elevationAvailable ? `${meta.ascentM} hm` : '—' },
    { label: 'Abstieg', value: meta.elevationAvailable ? `${meta.descentM} hm` : '—' },
    { label: 'Gelände', value: cap(meta.terrain) },
  ];

  return (
    <div className="rd-statgrid">
      {stats.map((s) => (
        <div key={s.label} className="rd-stat">
          <div className="rd-stat-label">{s.label}</div>
          <div className="rd-stat-value">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Detail-Chips und Original-Zeit (Dock der Vorschau). */
export function RouteDetails({ track }: Props) {
  const { meta } = track;

  return (
    <div className="rd-summary">
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

/** Höhenprofil als Bühne der Vorschau; ohne Höhen sagt die Bühne das. */
export function RouteElevation({ track }: Props) {
  const profile = useMemo(() => {
    if (!track.meta.elevationAvailable) return null;
    const pts = track.points;
    if (pts.length < 2) return null;
    const total = pts[pts.length - 1].dist;
    if (total <= 0) return null;

    let min = Infinity, max = -Infinity;
    for (const p of pts) { if (p.ele < min) min = p.ele; if (p.ele > max) max = p.ele; }
    return {
      min: Math.round(min), max: Math.round(max),
      startEle: Math.round(pts[0].ele), endEle: Math.round(pts[pts.length - 1].ele),
    };
  }, [track]);

  if (!profile) return <p className="rd-status">Für diese Strecke liegt kein Höhenprofil vor.</p>;
  const nn = (n: number) => n.toLocaleString('de-DE');

  return (
    <div className="rd-elev">
      <div className="rd-elev-head">
        <span>Höhenprofil{track.meta.elevationEnriched ? ' (DEM)' : ''}</span>
        <span>{nn(profile.min)} m → {nn(profile.max)} m ü. NN</span>
      </div>
      <div className="rd-elev-chart" role="img" aria-label={`Höhenprofil von ${nn(profile.startEle)} m am Start bis ${nn(profile.endEle)} m am Ziel, tiefster Punkt ${nn(profile.min)} m, höchster ${nn(profile.max)} m`}>
        <div className="rd-elev-chart-in">
          <Suspense fallback={null}><RouteElevationChart points={track.points} /></Suspense>
        </div>
      </div>
      <div className="rd-elev-axis">
        <span>Start · {nn(profile.startEle)} m</span>
        <span>Ziel · {nn(profile.endEle)} m</span>
      </div>
    </div>
  );
}

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
