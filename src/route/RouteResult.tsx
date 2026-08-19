/**
 * Ergebnis nach erfolgreichem Parsen — Command-Deck (hell). Datei-Leiste,
 * Track-Auswahl (bei mehreren Tracks), Validierung, Aufbereitung und die
 * Strecken-Vorschau (Vorlage T2/T12/T14). „Weiter zur Planung" → TourView.
 */

import { useEffect, useMemo, useState } from 'react';
import TourView from './TourView';
import RouteSummary from './RouteSummary';
import RouteDeckShell, { DeckLive, IconChevLeft, type RailFeature } from './RouteDeck';
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
  onHome: () => void;
  onOpenFeature?: (id: RailFeature) => void;
  isMobile: boolean;
}

export default function RouteResult({ file, format, parsed, onReset, onHome, onOpenFeature, isMobile }: Props) {
  const multi = parsed.tracks.length > 1;
  const [selection, setSelection] = useState<Selection>(multi ? 'all' : 0);
  // Schritt-Flow: erst Parse-Vorschau (T2), dann Planung/Ergebnis (TourView).
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

  // Planung/Ergebnis: TourView übernimmt die Shell (Vorlage T3–T5).
  if (tour.kind === 'done' && started) {
    return <TourView track={tour.track} fileLabel={file.name} onBack={() => setStarted(false)} onHome={onHome} onOpenFeature={onOpenFeature} isMobile={isMobile} />;
  }

  const crumb = (
    <div className="rd-crumb">
      <button type="button" className="rd-back" onClick={onReset}><IconChevLeft size={14} /> Andere Datei</button>
      <span className="rd-crumb-txt">· Tourenplanung</span>
    </div>
  );
  const mobileHeader = (
    <>
      <button type="button" className="rd-m-back" onClick={onReset} aria-label="Andere Datei"><IconChevLeft /></button>
      <div className="rd-m-htext"><div className="rd-m-title">Strecke erkannt</div></div>
    </>
  );

  return (
    <RouteDeckShell isMobile={isMobile} onHome={onHome} onOpenFeature={onOpenFeature} crumb={crumb} right={<DeckLive />} mobileHeader={mobileHeader}>
      <div className="rd-filebar">
        <span className="rd-filebar-badge">{format.label}</span>
        <span className="rd-filebar-name" title={file.name}>{file.name}</span>
        <span className="rd-filebar-sub">{formatFileSize(file.size)} · Tier {format.tier}</span>
        <button type="button" className="rd-filebar-replace" onClick={onReset}>Andere Datei</button>
      </div>

      {multi && <TrackSelector parsed={parsed} selection={selection} onSelect={setSelection} />}

      {!validation.ok ? (
        <p className="rd-status rd-status--error" role="alert">{validation.message}</p>
      ) : tour.kind === 'working' ? (
        <p className="rd-status">Strecke wird aufbereitet …</p>
      ) : tour.kind === 'error' ? (
        <p className="rd-status rd-status--error" role="alert">{tour.message}</p>
      ) : tour.kind === 'done' ? (
        <ParsedPreview track={tour.track} isMobile={isMobile} onContinue={() => setStarted(true)} />
      ) : null}
    </RouteDeckShell>
  );
}

/** Parse-Vorschau (T2): erkannter Streckenname, Kennzahlen + Höhenprofil, „Weiter". */
function ParsedPreview({ track, isMobile, onContinue }: { track: TourTrack; isMobile: boolean; onContinue: () => void }) {
  return (
    <>
      <span className="rd-preview-eyebrow">Strecke erkannt</span>
      <h1 className="rd-preview-title">{track.meta.name || 'Deine Strecke'}</h1>
      <RouteSummary track={track} />
      <button type="button" className={`rd-cta${isMobile ? ' rd-cta--full' : ''}`} onClick={onContinue}>
        Weiter zur Planung <IconArrowRight size={16} />
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
    <div className="rd-tracks">
      <span className="rd-tracks-label">
        {parsed.tracks.length} Tracks in der Datei — welcher soll angezeigt werden?
      </span>
      <div className="rd-tracks-options" role="group">
        <button
          type="button"
          className={`rd-track-chip${selection === 'all' ? ' is-active' : ''}`}
          onClick={() => onSelect('all')}
        >
          Alle (zusammengefügt) · {total.toLocaleString('de-DE')} Pkt.
        </button>
        {parsed.tracks.map((t, i) => (
          <button
            key={i}
            type="button"
            className={`rd-track-chip${selection === i ? ' is-active' : ''}`}
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
