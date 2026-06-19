/**
 * Ergebnis nach erfolgreichem Parsen: Datei-Leiste, Track-Auswahl (bei mehreren
 * Tracks), Validierung, Aufbereitung (Normalisierung, DEM-Höhen, Glättung,
 * Punkt-Reduktion) und schließlich Karte + Kennzahlen.
 */

import { useEffect, useMemo, useState } from 'react';
import TourView from './TourView';
import RouteSummary from './RouteSummary';
import { validateTrack } from './routeValidation';
import { buildTourTrack, type TourTrack } from './tourTrack';
import { formatFileSize, type RouteFormat } from './routeFormats';
import type { ParsedFile, ParsedRoute } from './routeModel';
import { IconArrowRight } from './routeIcons';

type Selection = 'all' | number;
type TourState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; track: TourTrack }
  | { kind: 'error'; message: string };

interface Props {
  file: File;
  format: RouteFormat;
  parsed: ParsedFile;
  onReset: () => void;
}

export default function RouteResult({ file, format, parsed, onReset }: Props) {
  const multi = parsed.tracks.length > 1;
  const [selection, setSelection] = useState<Selection>(multi ? 'all' : 0);
  // Schritt-Flow: erst Parse-Vorschau (Mockup 01), dann Planung/Ergebnis (TourView).
  const [started, setStarted] = useState(false);

  const route = useMemo<ParsedRoute>(() => buildRoute(parsed, selection), [parsed, selection]);
  const validation = useMemo(() => validateTrack(route.points), [route]);

  const [tour, setTour] = useState<TourState>({ kind: 'idle' });

  useEffect(() => {
    if (!validation.ok) { setTour({ kind: 'idle' }); return; }
    let cancelled = false;
    const ctrl = new AbortController();
    setTour({ kind: 'working' });
    setStarted(false); // Track-Wechsel → zurück in die Vorschau
    buildTourTrack(route, format.id, ctrl.signal)
      .then((track) => { if (!cancelled) setTour({ kind: 'done', track }); })
      .catch((err) => {
        if (cancelled) return;
        setTour({ kind: 'error', message: err instanceof Error ? err.message : 'Aufbereitung fehlgeschlagen.' });
      });
    return () => { cancelled = true; ctrl.abort(); };
  }, [route, validation, format.id]);

  // In der Planung/Ergebnis-Phase übernimmt TourView Kopf & Navigation (Mockup 02–04).
  if (tour.kind === 'done' && started) {
    return (
      <div className="route-result">
        <TourView track={tour.track} fileLabel={file.name} onBack={() => setStarted(false)} />
      </div>
    );
  }

  return (
    <div className="route-result">
      <div className="rt-card rt-filebar">
        <span className="rt-filebar-badge">{format.label}</span>
        <span className="rt-filebar-name" title={file.name}>{file.name}</span>
        <span className="rt-filebar-sub">{formatFileSize(file.size)} · Tier {format.tier}</span>
        <button type="button" className="rt-filebar-replace" onClick={onReset}>Andere Datei</button>
      </div>

      {multi && (
        <TrackSelector parsed={parsed} selection={selection} onSelect={setSelection} />
      )}

      {!validation.ok ? (
        <p className="route-status route-status-error" role="alert">{validation.message}</p>
      ) : tour.kind === 'working' ? (
        <p className="route-status">Strecke wird aufbereitet …</p>
      ) : tour.kind === 'error' ? (
        <p className="route-status route-status-error" role="alert">{tour.message}</p>
      ) : tour.kind === 'done' ? (
        <ParsedPreview track={tour.track} onContinue={() => setStarted(true)} />
      ) : null}
    </div>
  );
}

/** Parse-Vorschau (Mockup 01): Streckenname, Kennzahlen + Höhenprofil, „Weiter". */
function ParsedPreview({ track, onContinue }: { track: TourTrack; onContinue: () => void }) {
  return (
    <>
      <section className="rt-card rt-preview">
        <div className="rt-preview-head">
          <span className="rt-eyebrow">{(track.meta.name || 'Strecke erkannt').toUpperCase()}</span>
        </div>
        <RouteSummary track={track} />
      </section>
      <button type="button" className="rt-cta" onClick={onContinue}>
        Weiter zur Planung <IconArrowRight size={17} />
      </button>
    </>
  );
}

function TrackSelector({ parsed, selection, onSelect }: {
  parsed: ParsedFile;
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const total = parsed.tracks.reduce((s, t) => s + t.points.length, 0);
  return (
    <div className="route-tracks">
      <span className="route-tracks-label">
        {parsed.tracks.length} Tracks in der Datei — welcher soll angezeigt werden?
      </span>
      <div className="route-tracks-options" role="group">
        <button
          type="button"
          className={`route-track-chip${selection === 'all' ? ' is-active' : ''}`}
          onClick={() => onSelect('all')}
        >
          Alle (zusammengefügt) · {total.toLocaleString('de-DE')} Pkt.
        </button>
        {parsed.tracks.map((t, i) => (
          <button
            key={i}
            type="button"
            className={`route-track-chip${selection === i ? ' is-active' : ''}`}
            onClick={() => onSelect(i)}
          >
            {t.name ?? `Track ${i + 1}`} · {t.points.length.toLocaleString('de-DE')} Pkt.
          </button>
        ))}
      </div>
    </div>
  );
}

function buildRoute(parsed: ParsedFile, selection: Selection): ParsedRoute {
  if (selection === 'all') {
    return { name: parsed.name, points: parsed.tracks.flatMap((t) => t.points), waypoints: parsed.waypoints };
  }
  const track = parsed.tracks[selection];
  return { name: track.name ?? parsed.name, points: track.points, waypoints: parsed.waypoints };
}
