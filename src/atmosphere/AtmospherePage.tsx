/**
 * Atmosphäre · Feature-Shell.
 *
 * Ohne Ort: Idle-Intro (Stichpunkte + Ort-/Tour-Einstieg). Mit Ort: das
 * „Command-Deck" (AtmosphereDeck) — Vertikalschnitt/3D-Wetter mit den Linsen
 * Höhenwind · Inversion · Go/No-Go sowie den erhaltenen Linsen Föhn & Thermik.
 * Das alte Split-/Grid-Layout ist vom Deck abgelöst; die Datenpfade bleiben
 * (Store, Cross-Section, Sounding-Profil, Go/No-Go).
 */

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { tourFileToCutLine } from '../threed/tourImport';
import { pickCountry } from '../pointForecast/clustering';
import { AtmosphereProvider, useAtmosphere } from './atmosphereStore';
import AtmosphereDeck, { type DeckSub } from './AtmosphereDeck';
import type { Lens } from './atmosphereState';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import '../threed/threed.css';
import '../route/tourTheme.css';
import '../intro/intro.css';
import './atmosphere.css';

export type { DeckSub } from './AtmosphereDeck';

interface Props {
  onBack: () => void;
  onOpenFeature?: (id: RailFeature) => void;
  // --- Router (RT1), additiv: Linse aus `/atmosphaere/<lens>`, Unterlinse aus `?ansicht=` ---
  initialLens?: Lens | null;
  /** Linse von außen (nur Zurück/Vorwärts). */
  routeLens?: Lens | null;
  initialSub?: DeckSub | null;
  onLensChange?: (lens: Lens, initial: boolean) => void;
  onSubChange?: (sub: DeckSub) => void;
}

export default function AtmospherePage({ onBack, onOpenFeature, initialLens, routeLens, initialSub, onLensChange, onSubChange }: Props) {
  return (
    <AtmosphereProvider initialLens={initialLens} routeLens={routeLens} onLensChange={onLensChange}>
      <AtmosphereShell onBack={onBack} onOpenFeature={onOpenFeature} initialSub={initialSub} onSubChange={onSubChange} />
    </AtmosphereProvider>
  );
}

function AtmosphereShell({ onBack, onOpenFeature, initialSub, onSubChange }: Props) {
  const { location } = useAtmosphere();
  if (location) return <AtmosphereDeck onBack={onBack} onOpenFeature={onOpenFeature} initialSub={initialSub} onSubChange={onSubChange} />;

  return (
    <div className="atm-idle-shell">
      <FeatureRail
        active="atmosphere"
        onOpenFeature={onOpenFeature}
        onHome={onBack}
        navClass="atm-idle-rail"
        btnClass="atm-idle-rail-btn"
        activeClass="is-active"
        spacerClass="atm-idle-rail-spacer"
      />
    <div className="rt-page atm-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live">Vertikalschnitt</span>
          <button type="button" className="rt-nav-item" onClick={onBack}>Zurück</button>
        </div>
      </nav>
      <main className="rt-container">
        <AtmosphereIntro />
      </main>
    </div>
    </div>
  );
}

// --- Idle-Intro (Einstieg: Stichpunkte + Ort/Tour) ---------------------------

const ATM_INTRO_CAPS = [
  'Höhenwind-Geländeschnitt mit Vektoren, Isotachen, Shear & Wolkenbasis',
  'Inversion / Kaltluftsee — Temperatur-Umkehr, Nebelobergrenze, Aufstiegs-Delta',
  'Go/No-Go Betriebs-Check (B2B): Böen auf Arbeitshöhe, Grenzwerte, Zeitfenster',
  'Aus ICON-D2-Druckflächen + Gelände (DEM), höhenkorrigiert — werbefrei, keine Tracker',
];

function AtmosphereIntro() {
  return (
    <section className="atm-intro" style={{ ['--intro-accent']: 'var(--steel-600)' } as CSSProperties}>
      <span className="intro-eyebrow">Atmosphäre · Vertikalschnitt</span>
      <h1 className="intro-title">Die Atmosphäre über dir</h1>
      <p className="intro-body">
        Wähle einen Ort oder lade eine Tour (GPX/TCX/FIT) hoch — dann zeigen wir dir den
        Vertikalschnitt darüber: Höhenwind, Inversion und den Go/No-Go-Betriebs-Check über die
        nächsten Stunden, mit ehrlicher Einordnung.
      </p>
      <ul className="intro-caps">
        {ATM_INTRO_CAPS.map((c) => (
          <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
        ))}
      </ul>

      <div className="atm-intro-action">
        <span className="rt-eyebrow">Ort wählen oder Tour hochladen</span>
        <div className="atm-intro-row">
          <LocationField />
          <TourImportButton />
        </div>
      </div>

      <p className="intro-howto">
        <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
        <span><strong>So geht’s:</strong> Ort suchen oder GPX/Tour laden — danach zeichnest du die Schnittlinie und wählst die Linse.</span>
      </p>

      <div className="rt-trust" style={{ marginTop: '1rem' }}>
        <span className="dot">●</span> ICON-D2 + Gelände, höhenkorrigiert · werbefrei · keine Tracker
      </div>
    </section>
  );
}

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

// --- Tour-/GPX-Import — setzt Ort/Marker aus einer Tourdatei ------------------

function TourImportButton() {
  const { setLocation } = useAtmosphere();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(null);
    try {
      const tour = await tourFileToCutLine(f);
      const s = tour.points[0];
      setLocation({ name: tour.name, lat: s.lat, lon: s.lon, country: pickCountry(s.lat, s.lon) });
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Tour konnte nicht gelesen werden.');
    }
  }
  return (
    <span className="atm-tour">
      <input ref={fileRef} type="file" accept=".gpx,.tcx,.fit,.kml,.kmz" style={{ display: 'none' }} onChange={onFile} />
      <button type="button" className="atm-tour-btn" onClick={() => fileRef.current?.click()}>⤓ Tour laden</button>
      {err && <span className="atm-tour-err">⚠ {err}</span>}
    </span>
  );
}

// --- Ort-Suche (kompakt, DACH) -----------------------------------------------

function LocationField() {
  const { location, setLocation } = useAtmosphere();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null); setResults([]);
    try {
      const found = await geocodeDACH(q, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setError('Keine Ergebnisse in DE / AT / CH.');
      else if (found.length === 1) setLocation(found[0]);
      else setResults(found);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally { setLoading(false); }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void search(); }
    if (e.key === 'Escape') { setResults([]); setError(null); }
  }

  if (location) {
    return (
      <div className="ev-loc-chip rt-card">
        <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(location.country)}</span>
        <span className="ev-loc-name">{location.name}</span>
        <button type="button" className="ev-loc-change" onClick={() => { setLocation(null); setResults([]); setQuery(''); }}>Ändern</button>
      </div>
    );
  }
  return (
    <div className="ev-search-wrap">
      <div className="ev-search">
        <svg className="ev-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="8" cy="8" r="6" /><line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input type="text" className="ev-search-input" placeholder="Stadt, Adresse oder PLZ …" value={query}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} disabled={loading} aria-label="Ort suchen" />
        <button type="button" className="ev-search-go" onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Suchen'}
        </button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon}-${i}`} type="button" className="ev-search-result" onClick={() => setLocation(r)}>
              <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(r.country)}</span>
              <span className="ev-search-result-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
