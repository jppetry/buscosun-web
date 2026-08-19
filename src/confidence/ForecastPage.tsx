/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Seite.
 *
 * Laien-Default mit Progressive Disclosure (US-5.1): Headline + Confidence pro
 * Tag, Detail auf Abruf. Einfach/Experte-Toggle (US-5.2). Vertrauen aus der
 * Übereinstimmung mehrerer unabhängiger Modelle (US-6.1/6.2).
 */

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import ForecastDeck from './ForecastDeck';
import '../intro/intro.css';
import '../route/tourTheme.css';
import './forecast.css';

/** Möglichkeiten-Stichpunkte des Idle-Kopfs (Aufbau wie das Regenradar). */
const FC_INTRO_CAPS = [
  'Mehrere unabhängige Modelle nebeneinander vergleichen',
  'Unsicherheitsband statt einer scheingenauen Zahl',
  'Pro Tag: Sicherheit + Stabilität über die letzten Läufe',
  'Treffsicherheits-Rückblick — wie gut lag das Modell zuletzt?',
];

/* Kleine Line-Icons (currentColor) für Stichpunkte + „So geht's" — wie im Regenradar. */
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

import { FeatureRail, type RailFeature } from '../nav/featureRail';

interface Props { onBack: () => void; onOpenFeature?: (id: RailFeature) => void }

/**
 * Orchestriert nur noch Idle-/Standortschritt vs. das Command-Deck: ohne Ort der
 * Regenradar-artige Idle-Kopf (Eyebrow → Headline → Stichpunkte → Suche →
 * „So geht's"), mit Ort das vollflächige `ForecastDeck` (Topbar · Rail · Dock ·
 * Center · Readout). Der gesamte Datenlebenszyklus liegt im Deck.
 */
export default function ForecastPage({ onBack, onOpenFeature }: Props) {
  const [location, setLocation] = useState<Location | null>(null);

  if (location) return <ForecastDeck location={location} setLocation={setLocation} onBack={onBack} onOpenFeature={onOpenFeature} />;

  return (
    <div className="fc-idle-shell">
      <FeatureRail
        active="forecast"
        onOpenFeature={onOpenFeature}
        onHome={onBack}
        navClass="fc-idle-rail"
        btnClass="fc-idle-rail-btn"
        activeClass="is-active"
        spacerClass="fc-idle-rail-spacer"
      />
    <div className="rt-page fc-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live fc-live">Modellvergleich</span>
          <span className="rt-nav-avatar">JK</span>
        </div>
      </nav>

      <main className="rt-container">
        {/* Idle-Kopf ohne Standort: Aufbau wie das Regenradar — Eyebrow → Headline
            → Body → Stichpunkte → Suche → „So geht's". Sobald ein Ort gewählt ist,
            übernimmt das Command-Deck. */}
        <section className="rt-section fc-lead" style={{ ['--intro-accent']: 'var(--fc-sage)' } as CSSProperties}>
          <div className="fc-lead-copy">
            <span className="intro-eyebrow">Vorhersage-Sicherheit &amp; Modellvergleich</span>
            <h1 className="fc-lead-title">Wie verlässlich ist die Vorhersage?</h1>
            <p className="intro-body">
              Mehrere unabhängige Wettermodelle für deinen Ort — wo sie sich einig sind, ist die Prognose verlässlich.
            </p>
            <ul className="intro-caps">
              {FC_INTRO_CAPS.map((c) => (
                <li key={c}><span className="intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
              ))}
            </ul>
            <div className="fc-lead-search">
              <span className="rt-eyebrow fc-eyebrow">Standort</span>
              <ForecastLocationField value={location} onChange={setLocation} />
            </div>
            <p className="intro-howto">
              <span className="intro-howto-ic" aria-hidden="true"><IconHowTo /></span>
              <span><strong>So geht’s:</strong> Ort wählen und auf die Spannweite achten — eng heißt sicher.</span>
            </p>
          </div>
        </section>
      </main>
    </div>
    </div>
  );
}

// --- Ort-Suche (kompakt, DACH) ----------------------------------------------
function ForecastLocationField({ value, onChange }: { value: Location | null; onChange: (l: Location | null) => void }) {
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
      else if (found.length === 1) onChange(found[0]);
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

  if (value) {
    return (
      <div className="ev-loc-chip rt-card">
        <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(value.country)}</span>
        <span className="ev-loc-name">{value.name}</span>
        <button type="button" className="ev-loc-change" onClick={() => { onChange(null); setResults([]); setQuery(''); }}>Ändern</button>
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
        <button type="button" className="ev-search-go fc-search-go" onClick={() => void search()} disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Suchen'}
        </button>
      </div>
      {(results.length > 0 || error) && (
        <div className="ev-search-dropdown" role="listbox">
          {error && <div className="ev-search-error">⚠ {error}</div>}
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon}-${i}`} type="button" className="ev-search-result" onClick={() => onChange(r)}>
              <span className="ev-loc-flag" aria-hidden="true">{flagForCountry(r.country)}</span>
              <span className="ev-search-result-name">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
