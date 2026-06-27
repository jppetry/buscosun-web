/**
 * „Wetter entlang der Route".
 *
 * Ablauf: Strecke hochladen → validieren (Größe, Magic-Byte-Format, Schema,
 * Punktanzahl) → parsen → Track wählen, prüfen (Länge, Plausibilität, Region)
 * → auf der Karte zeigen und alle Kennzahlen bereitstellen. Das Wetter entlang
 * der Strecke folgt im nächsten Schritt.
 */

import { useState, type CSSProperties } from 'react';
import RouteUpload from './RouteUpload';
import RouteResult from './RouteResult';
import { parseRouteFile } from './parseRoute';
import { getFormat, sniffFormat, type RouteFormat } from './routeFormats';
import { validateFileSize, validatePointCount } from './routeValidation';
import type { ParsedFile } from './routeModel';
// Idle-/Intro-Kopf in der Designsprache des „Entdecke buscosun"-Intros (wie
// Regenradar): Eyebrow → Titel → Möglichkeiten → Aktion → „So geht's".
import '../intro/intro.css';
import './RoutePage.css';
import './tourTheme.css';

interface Props {
  onBack: () => void;
}

/** Möglichkeiten-Liste des Idle-Kopfs — was die Tourenplanung dir bietet. */
const RT_INTRO_CAPS = [
  'Wind, Regen und Temperatur an jedem Kilometer',
  'Wetter zur tatsächlichen Ankunftszeit — nicht pauschal „heute"',
  'Rücken- und Gegenwind entlang deiner Fahrtrichtung',
  'Native Behörden-Quellen (DWD · GeoSphere · MeteoSwiss), höhenkorrigiert',
];

/* Kleine Line-Icons (currentColor) für Möglichkeiten + „So geht's" — wie im
   Intro-Overlay und auf der Regenradar-Seite. */
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3,8.5 6.5,12 13,4" />
    </svg>
  );
}
function IconHowTo() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" /><polyline points="6.6,5.4 10,8 6.6,10.6" />
    </svg>
  );
}

type Status =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string }
  | { kind: 'error'; fileName: string; message: string }
  | { kind: 'ready'; file: File; format: RouteFormat; parsed: ParsedFile };

export default function RoutePage({ onBack }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

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

  return (
    <div className="rt-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live"><span className="live-dot" /> Daten live</span>
          <span className="rt-nav-avatar">JK</span>
        </div>
      </nav>
      <main className="rt-container">
        {status.kind === 'idle' && (
          <section className="rt-intro2" style={{ ['--intro-accent']: 'var(--terracotta-500)' } as CSSProperties}>
            <div className="rt-intro-copy">
              <span className="intro-eyebrow">Tourenplanung</span>
              <h1 className="rt-intro-title">Wetter entlang deiner Route</h1>
              <p className="intro-body">
                Lade deine geplante Tour hoch — wir zeigen dir Wind, Regen und Temperatur
                an jedem Kilometer, zur tatsächlichen Uhrzeit deiner Ankunft.
              </p>
              <ul className="intro-caps">
                {RT_INTRO_CAPS.map((c) => (
                  <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
                ))}
              </ul>
            </div>

            <div className="rt-intro-action">
              <span className="rt-eyebrow rt-intro-upload-eyebrow">Strecke hochladen</span>
              <RouteUpload onFile={handleFile} />
            </div>

            <p className="intro-howto rt-intro-howto">
              <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
              <span><strong>So geht’s:</strong> Strecke hochladen — wir rechnen Tempo, Ankunftszeiten und das Wetter Kilometer für Kilometer aus.</span>
            </p>

            <div className="rt-trust">
              <span className="dot">●</span> Native Behörden-Quellen: DWD · GeoSphere · MeteoSwiss · höhenkorrigiert · keine Tracker
            </div>
          </section>
        )}

        {status.kind === 'parsing' && (
          <div className="route-result">
            <p className="route-status">„{status.fileName}" wird geprüft und gelesen …</p>
          </div>
        )}

        {status.kind === 'error' && (
          <div className="route-result">
            <div className="route-filebar route-filebar-error">
              <div className="route-file-meta">
                <span className="route-file-name" title={status.fileName}>{status.fileName}</span>
                <span className="route-file-sub route-status-error">{status.message}</span>
              </div>
              <button type="button" className="route-file-replace" onClick={reset}>Andere Datei</button>
            </div>
          </div>
        )}

        {status.kind === 'ready' && (
          <RouteResult file={status.file} format={status.format} parsed={status.parsed} onReset={reset} />
        )}
      </main>
    </div>
  );
}
