/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Seite.
 *
 * Laien-Default mit Progressive Disclosure (US-5.1): Headline + Confidence pro
 * Tag, Detail auf Abruf. Einfach/Experte-Toggle (US-5.2). Vertrauen aus der
 * Übereinstimmung mehrerer unabhängiger Modelle (US-6.1/6.2).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { fetchMultiModelForecast, type MultiModelForecast } from './multiModel';
import { fetchForecastHistory, type ForecastHistory } from './forecastHistory';
import { buildDayVMs, firstLowConfidenceDay, buildStabilityMap } from './forecastView';
import { fetchHitRate, type HitRateData } from './hitRate';
import { sourceRanking, simpleLabel, confidenceFactor } from './hitRateModel';
import ConfidenceCards from './ConfidenceCards';
import ModelCompare from './ModelCompare';
import DayDetail from './DayDetail';
import HitRatePanel from './HitRatePanel';
import MosPanel from '../ml/MosPanel';
import '../intro/intro.css';
import '../route/tourTheme.css';
import './forecast.css';

const DISCOVERY_KEY = 'buscosun.forecast.stabilityDiscovered.v1';

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

interface Props { onBack: () => void }

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; forecast: MultiModelForecast }
  | { kind: 'error'; message: string };

export default function ForecastPage({ onBack }: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [history, setHistory] = useState<ForecastHistory | null>(null);
  const [hitData, setHitData] = useState<HitRateData | null>(null);
  const [selected, setSelected] = useState(0);
  const [showDiscovery, setShowDiscovery] = useState<boolean>(() => {
    try { return localStorage.getItem(DISCOVERY_KEY) !== '1'; } catch { return true; }
  });
  function dismissDiscovery() { setShowDiscovery(false); try { localStorage.setItem(DISCOVERY_KEY, '1'); } catch { /* ignore */ } }
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!location) { setState({ kind: 'idle' }); return; }
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setState({ kind: 'loading' });
    setSelected(0);
    setHistory(null);
    setHitData(null);
    (async () => {
      try {
        // Modellvergleich (Pflicht) + Verlaufshistorie (optional) parallel.
        const [fcRes, histRes] = await Promise.allSettled([
          fetchMultiModelForecast(location.lat, location.lon, ac.signal),
          fetchForecastHistory(location.lat, location.lon, ac.signal),
        ]);
        if (ac.signal.aborted) return;
        if (fcRes.status === 'rejected') {
          setState({ kind: 'error', message: fcRes.reason instanceof Error ? fcRes.reason.message : 'Modelldaten nicht erreichbar' });
          return;
        }
        setState({ kind: 'ready', forecast: fcRes.value });
        setHistory(histRes.status === 'fulfilled' ? histRes.value : null);
      } catch (err) {
        if (ac.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Modelldaten nicht erreichbar' });
      }
    })();
    return () => ac.abort();
  }, [location]);

  // Treffsicherheit/Rückblick separat & lazy (datenintensiv, blockiert den
  // ersten Paint nicht). US-7.1 ff.
  useEffect(() => {
    if (!location) { setHitData(null); return; }
    const ac = new AbortController();
    fetchHitRate(location.lat, location.lon, ac.signal)
      .then((d) => { if (!ac.signal.aborted) setHitData(d); })
      .catch((err) => { if (err?.name !== 'AbortError') setHitData(null); });
    return () => ac.abort();
  }, [location]);

  // Beste jüngste Temperatur-Trefferquote (Lead 1, 7 Tage) → Laien-Label (US-7.2)
  // und Confidence-Faktor (US-7.5).
  const bestTempMae = useMemo(() => {
    if (!hitData) return NaN;
    const best = sourceRanking(hitData, 'temp', 1, 7).scores.find((s) => Number.isFinite(s.raw));
    return best ? best.raw : NaN;
  }, [hitData]);
  const hitLabel = useMemo(() => simpleLabel(bestTempMae), [bestTempMae]);
  const hitFactor = useMemo(() => confidenceFactor(bestTempMae), [bestTempMae]);

  const days = useMemo(() => (state.kind === 'ready' ? buildDayVMs(state.forecast, hitFactor) : []), [state, hitFactor]);
  const lowDay = useMemo(() => firstLowConfidenceDay(days), [days]);
  const stabMap = useMemo(() => (history ? buildStabilityMap(history) : null), [history]);

  return (
    <div className="rt-page fc-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live fc-live">{state.kind === 'ready' ? `${state.forecast.models.length} Quellen aktiv` : 'Modellvergleich'}</span>
          <span className="rt-nav-avatar">JK</span>
        </div>
      </nav>

      <main className="rt-container">
        {/* Idle-Kopf ohne Standort: Aufbau wie das Regenradar — Eyebrow → Headline
            → Body → Stichpunkte → Suche → „So geht's". Sobald ein Ort gewählt ist,
            wird die Suche kompakt (Chip) und die Ergebnisse übernehmen. */}
        {!location ? (
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
        ) : (
          <section className="rt-section">
            <ForecastLocationField value={location} onChange={setLocation} />
          </section>
        )}

        {location && state.kind === 'loading' && (
          <div className="rt-card fc-state"><span className="ev-spinner" /> <p>Mehrere Modelle werden abgeglichen …</p></div>
        )}
        {location && state.kind === 'error' && (
          <div className="rt-card fc-state"><p>⚠ {state.message}</p></div>
        )}

        {state.kind === 'ready' && days.length > 0 && (
          <>
            {showDiscovery && stabMap && (
              <div className="fc-discovery">
                <span className="fc-discovery-icon">✦</span>
                <div>
                  <strong>Neu: Vorhersage-Stabilität</strong>
                  <p>Jede Tageskarte zeigt jetzt einen Chip „Stabil / Wechselhaft" — wie sehr sich die Prognose über die letzten Läufe noch bewegt. <em>Stabil heißt nicht automatisch richtig.</em></p>
                </div>
                <button type="button" className="fc-discovery-close" onClick={dismissDiscovery} aria-label="Hinweis schließen">✕</button>
              </div>
            )}

            <div className="fc-block-head">
              <span className="rt-eyebrow fc-eyebrow">7 Tage · Sicherheit sinkt mit Vorlaufzeit</span>
            </div>
            {hitData && Number.isFinite(bestTempMae) && (
              <div className={`fc-hitlabel is-${hitLabel.tone}`}>
                <span className="fc-hitlabel-glyph">{hitLabel.glyph}</span>
                <span className="fc-hitlabel-text">{hitLabel.text}</span>
                <span className="fc-hitlabel-sub">— Rückblick der letzten Tage</span>
              </div>
            )}

            <ConfidenceCards days={days} selected={selected} onSelect={setSelected} stab={stabMap} />

            <ModelCompare forecast={state.forecast} vm={days[selected]} />

            <DayDetail
              forecast={state.forecast}
              vm={days[selected]}
              lowDay={lowDay}
              history={history}
              stab={stabMap?.get(days[selected].day.dateISO) ?? null}
            />

            {hitData && <HitRatePanel data={hitData} />}

            {location && <MosPanel location={location} live={state.forecast} />}

            <p className="fc-foot">
              Sicherheit aus der Übereinstimmung von {state.forecast.models.length} unabhängigen Modellen
              ({state.forecast.models.map((m) => m.label).join(' · ')}). Stufen: Hoch ≥ 70 %, Mittel 40–69 %, Niedrig &lt; 40 %.
            </p>
          </>
        )}
      </main>
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
