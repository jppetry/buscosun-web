/**
 * „Wetter entlang der Route" — Command-Deck (hell).
 *
 * Ablauf: Strecke hochladen → validieren (Größe, Magic-Byte-Format, Schema,
 * Punktanzahl) → parsen → Track wählen, prüfen (Länge, Plausibilität, Region)
 * → Vorschau/Planung/Ergebnis (RouteResult → TourView). Die Shell (Topbar +
 * Ink-Rail bzw. Mobile-Header) stellt RouteDeckShell; jeder Screen liefert sie
 * identisch. Vorlage: references/routenplaner.dc.html (T1/T8/T11).
 */

import { useState } from 'react';
import RouteUpload from './RouteUpload';
import RouteResult from './RouteResult';
import RouteDeckShell, { DeckLive, type RailFeature } from './RouteDeck';
import { parseRouteFile } from './parseRoute';
import { getFormat, sniffFormat, type RouteFormat } from './routeFormats';
import { validateFileSize, validatePointCount } from './routeValidation';
import { useIsMobile } from '../mobile/useIsMobile';
import type { ParsedFile } from './routeModel';
import '../mobile/safeArea.css';
import './routeDeck.css';

interface Props {
  onBack: () => void;
  /** Rail-Sprung in ein anderes Werkzeug (optional). */
  onOpenFeature?: (id: RailFeature) => void;
}

/** Möglichkeiten-Liste des Idle-Kopfs — was die Tourenplanung dir bietet. */
const RT_INTRO_CAPS = [
  'Wind, Regen und Temperatur an jedem Kilometer',
  'Wetter zur tatsächlichen Ankunftszeit — nicht pauschal „heute"',
  'Rücken- und Gegenwind entlang deiner Fahrtrichtung',
  'Native Behörden-Quellen (DWD · GeoSphere · MeteoSwiss), höhenkorrigiert',
];

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,8.5 6.5,12 13,4" />
    </svg>
  );
}
function IconHowTo() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" /><polyline points="6.6,5.4 10,8 6.6,10.6" />
    </svg>
  );
}

type Status =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string }
  | { kind: 'error'; fileName: string; message: string }
  | { kind: 'ready'; file: File; format: RouteFormat; parsed: ParsedFile };

export default function RoutePage({ onBack, onOpenFeature }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const isMobile = useIsMobile();

  async function handleFile(file: File) {
    // 1) Größenlimit (vor dem Einlesen).
    const size = validateFileSize(file);
    if (!size.ok) {
      setStatus({ kind: 'error', fileName: file.name, message: size.message });
      return;
    }

    setStatus({ kind: 'parsing', fileName: file.name });
    try {
      // 2) Format über Magic Bytes erkennen (nicht nur Endung).
      const formatId = await sniffFormat(file);
      if (!formatId) {
        throw new Error('Dateiinhalt nicht erkannt — das ist keine gültige GPX-, TCX-, FIT-, KML- oder KMZ-Datei.');
      }
      // 3) Parsen (inkl. Schema-/Wurzelelement-Prüfung).
      const parsed = await parseRouteFile(file, formatId);
      // 4) Gesamt-Punktanzahl begrenzen.
      const total = parsed.tracks.reduce((s, t) => s + t.points.length, 0);
      const count = validatePointCount(total);
      if (!count.ok) throw new Error(count.message);

      setStatus({ kind: 'ready', file, format: getFormat(formatId), parsed });
    } catch (err) {
      setStatus({
        kind: 'error',
        fileName: file.name,
        message: err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.',
      });
    }
  }

  const reset = () => setStatus({ kind: 'idle' });

  // Planung/Ergebnis bringt seine eigene Shell mit (RouteResult → TourView).
  if (status.kind === 'ready') {
    return <RouteResult file={status.file} format={status.format} parsed={status.parsed} onReset={reset} onHome={onBack} onOpenFeature={onOpenFeature} isMobile={isMobile} />;
  }

  const crumb = <span className="rd-crumb-txt">Tourenplanung</span>;
  const right = (
    <>
      <DeckLive />
      {!isMobile && <span className="rd-avatar">JK</span>}
    </>
  );
  const mobileHeader = (
    <div className="rd-m-brand">
      <img className="rd-mark" src="/buscosun-mark.svg" width={24} height={24} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      <button type="button" className="rd-m-brand-name" onClick={onBack}>buscosun</button>
      <span className="rd-m-live"><span className="rd-live-dot" /><span className="rd-m-live-txt">Live</span></span>
    </div>
  );

  return (
    <RouteDeckShell isMobile={isMobile} onHome={onBack} onOpenFeature={onOpenFeature} crumb={crumb} right={right} mobileHeader={mobileHeader}>
      {status.kind === 'idle' && (
        <section className="rd-intro">
          <span className="rd-intro-eyebrow">Tourenplanung</span>
          <h1 className="rd-intro-title">Wetter entlang deiner Route</h1>
          <p className="rd-intro-body">
            Lade deine geplante Tour hoch — wir zeigen dir Wind, Regen und Temperatur
            an jedem Kilometer, zur tatsächlichen Uhrzeit deiner Ankunft.
          </p>
          <ul className="rd-caps">
            {RT_INTRO_CAPS.map((c) => (
              <li key={c}><span className="rd-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
            ))}
          </ul>

          <div className="rd-section-label">Strecke hochladen</div>
          <RouteUpload onFile={handleFile} />

          {!isMobile && (
            <div className="rd-howto">
              <span className="rd-howto-ic" aria-hidden="true"><IconHowTo /></span>
              <span><strong>So geht’s:</strong> Strecke hochladen — wir rechnen Tempo, Ankunftszeiten und das Wetter Kilometer für Kilometer aus.</span>
            </div>
          )}
          <div className="rd-trust">
            <span className="dot">●</span> Native Behörden-Quellen: DWD · GeoSphere · MeteoSwiss · höhenkorrigiert · keine Tracker
          </div>
        </section>
      )}

      {status.kind === 'parsing' && (
        <p className="rd-status">„{status.fileName}" wird geprüft und gelesen …</p>
      )}

      {status.kind === 'error' && (
        <div className="rd-filebar rd-filebar--error" style={{ marginTop: 8 }}>
          <span className="rd-filebar-name" title={status.fileName}>{status.fileName}</span>
          <span className="rd-filebar-sub">{status.message}</span>
          <button type="button" className="rd-filebar-replace" onClick={reset}>Andere Datei</button>
        </div>
      )}
    </RouteDeckShell>
  );
}
