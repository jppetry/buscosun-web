/**
 * Atmosphäre · Feature-Shell (P1).
 *
 * Linsen-Umschalter (Fliegen / Berg & Weg / Himmel), dreistufige Progressive
 * Disclosure (Verdict / Profil / Nerd) und der globale Time-Scrubber (+0..+48h).
 * Layout folgt der Layout-Schematik: Split bei Desktop & Tablet-Querformat,
 * gestapelt bei Mobile & Tablet-Hochformat; Scrubber sticky unten auf Touch.
 *
 * P1 verdrahtet nur das Gerüst: Datenbereiche sind klar beschriftete Platzhalter
 * (keine Fake-Daten). Der Time-Scrubber ist die einzige Quelle der Wahrheit für
 * die aktive Stunde — alle Bereiche abonnieren sie über useAtmosphere().
 */

import { lazy, Suspense, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { tourFileToCutLine } from '../threed/tourImport';
import { pickCountry } from '../pointForecast/clustering';
import { AtmosphereProvider, useAtmosphere } from './atmosphereStore';
import { LENSES, LENS_LABEL, HOUR_MIN, HOUR_MAX, type Lens } from './atmosphereState';
import AtmosphereProfile from './AtmosphereProfile';
import AtmosphereVerdict from './AtmosphereVerdict';
import ThermalMap from './ThermalMap';
import FoehnPanel from './FoehnPanel';
import SectionLens from './SectionLens';
import '../threed/threed.css';
import '../route/tourTheme.css';
import '../intro/intro.css';
import './atmosphere.css';

interface Props { onBack: () => void }

// Tiefe 3: nur bei Opt-in laden (hält Skew-T & Co. aus dem Standard-Bundle).
const NerdPanel = lazy(() => import('./NerdPanel'));

export default function AtmospherePage({ onBack }: Props) {
  return (
    <AtmosphereProvider>
      <AtmosphereShell onBack={onBack} />
    </AtmosphereProvider>
  );
}

function AtmosphereShell({ onBack }: Props) {
  const { lens, location, modelRunAt } = useAtmosphere();
  return (
    <div className="rt-page atm-page">
      <div className="rt-grain" />
      <nav className="rt-nav">
        <a className="rt-nav-logo" href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>
          <span className="rt-nav-logo-mark" /><span className="rt-nav-logo-name">buscosun</span>
        </a>
        <div className="rt-nav-right">
          <span className="rt-nav-live">{LENS_LABEL[lens]}</span>
          <button type="button" className="rt-nav-item" onClick={onBack}>Zurück</button>
        </div>
      </nav>

      <main className="rt-container">
        {!location ? (
          <AtmosphereIntro />
        ) : (
          <>
            <header className="rt-intro">
              <span className="rt-eyebrow">Atmosphäre</span>
              <h1>Die Atmosphäre über dir</h1>
            </header>

            <div className="atm-head">
              <LensSwitcher />
              <div className="atm-head-right">
                <LocationField />
                <TourImportButton />
                <span className="atm-run">⏱ Modelllauf: <b>{modelRunAt ? `${fmtRunUTC(modelRunAt)} · vor ${ageHours(modelRunAt)} h` : '—'}</b></span>
              </div>
            </div>

            {lens === 'section' ? (
              <SectionLens />
            ) : (
              <>
                <div className="atm-grid">
                  <AtmosphereVerdict />
                  {lens === 'fly' ? <ThermalMap /> : <FoehnPanel />}
                  <AtmosphereProfile />
                  <NerdMode />
                </div>
                <Scrubber />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// --- Idle-Intro (Einstieg wie die übrigen Features: Stichpunkte + Ort/Tour) ---

const ATM_INTRO_CAPS = [
  'Vertikalprofil aus echtem ICON-EU-Sounding — Temperatur, Taupunkt, Höhenwind, Inversion',
  'Drei Linsen: Föhn · Thermik · Querschnitt',
  'Thermik-Karte, Föhn-Index, Talwind, Vertikalschnitt & Skew-T (Detailansicht)',
  'Aus ICON-EU (~7 km) + Gelände, höhenkorrigiert — werbefrei, keine Tracker',
];

function AtmosphereIntro() {
  return (
    <section className="atm-intro" style={{ ['--intro-accent']: 'var(--steel-600)' } as CSSProperties}>
      <span className="intro-eyebrow">Atmosphäre</span>
      <h1 className="intro-title">Die Atmosphäre über dir</h1>
      <p className="intro-body">
        Wähle einen Ort oder lade eine Tour (GPX/TCX/FIT) hoch — dann zeigen wir dir die Atmosphäre
        darüber: Thermik, Wind und Wolken in der Höhe, mit ehrlicher Einschätzung über die nächsten 48 Stunden.
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
        <span><strong>So geht’s:</strong> Ort suchen oder GPX/Tour laden — danach wählst du die Linse und scrubbst durch die nächsten 48 Stunden.</span>
      </p>

      <div className="rt-trust" style={{ marginTop: '1rem' }}>
        <span className="dot">●</span> ICON-EU (~7 km) + Gelände, höhenkorrigiert · werbefrei · keine Tracker
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

// --- Linsen-Umschalter -------------------------------------------------------

function LensSwitcher() {
  const { lens, setLens } = useAtmosphere();
  return (
    <div className="atm-seg" role="tablist" aria-label="Linse">
      {LENSES.map((l: Lens) => (
        <button
          key={l} type="button" role="tab" aria-selected={lens === l}
          className={`atm-seg-btn${lens === l ? ' is-active' : ''}`}
          onClick={() => setLens(l)}
        >
          {LENS_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

// --- Nerd-Mode (Tiefe 3, Platzhalter in P1) ----------------------------------

function NerdMode() {
  const { nerdOpen, setNerdOpen } = useAtmosphere();
  return (
    <section className="rt-card atm-nerd" aria-label="Detailansicht">
      <button
        type="button" className="atm-nerd-toggle"
        aria-expanded={nerdOpen} onClick={() => setNerdOpen(!nerdOpen)}
      >
        {nerdOpen ? '▾' : '▸'} Werte anzeigen (Detailansicht)
      </button>
      {nerdOpen && (
        <Suspense fallback={<div className="atm-nerd-body">Detailansicht wird geladen …</div>}>
          <NerdPanel />
        </Suspense>
      )}
    </section>
  );
}

// --- Time-Scrubber (einzige Quelle der Wahrheit) -----------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');
function fmtAbs(d: Date): string {
  const wd = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  return `${wd} ${pad2(d.getHours())}:00`;
}
function fmtRunUTC(d: Date): string {
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}. ${pad2(d.getUTCHours())}Z`;
}
function ageHours(d: Date): number {
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 3_600_000));
}
/** Relative Bezeichnung gegenüber der echten aktuellen Zeit. */
function relFromNow(deltaMs: number): string {
  const min = Math.round(deltaMs / 60_000);
  const a = Math.abs(min);
  if (a < 30) return 'jetzt';
  const fut = min > 0;
  if (a < 60 * 24) { const h = Math.round(a / 60); return fut ? `in ${h} h` : `vor ${h} h`; }
  const d = Math.round(a / (60 * 24));
  return fut ? `in ${d} Tag${d > 1 ? 'en' : ''}` : `vor ${d} Tag${d > 1 ? 'en' : ''}`;
}

function Scrubber() {
  const { hour, setHour, modelRunAt } = useAtmosphere();
  // Absolute Zeit ankert am Modelllauf (valid = Lauf + Vorlaufstunde); vor dem
  // ersten Laden Fallback auf die volle aktuelle Stunde.
  const nowBase = useMemo(() => { const d = new Date(); d.setMinutes(0, 0, 0); return d.getTime(); }, []);
  const baseMs = modelRunAt ? modelRunAt.getTime() : nowBase;
  const activeMs = baseMs + hour * 3_600_000;
  const activeTime = new Date(activeMs);
  const nowMs = Date.now();
  const nowOffset = (nowMs - baseMs) / 3_600_000;
  const nowPct = Math.max(0, Math.min(100, ((nowOffset - HOUR_MIN) / (HOUR_MAX - HOUR_MIN)) * 100));
  const rel = relFromNow(activeMs - nowMs);

  return (
    <div className="atm-scrub">
      <div className="atm-scrub-track">
        <input
          type="range" className="atm-scrub-range"
          min={HOUR_MIN} max={HOUR_MAX} step={1} value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          aria-label="Vorhersage-Vorlaufstunde"
          aria-valuetext={`${rel} · ${fmtAbs(activeTime)}`}
        />
        {nowOffset >= 0 && nowOffset <= HOUR_MAX && (
          <span className="atm-scrub-now" style={{ left: `${nowPct}%` }} aria-hidden="true">
            <span className="atm-scrub-now-label" style={{ left: 0 }}>jetzt</span>
          </span>
        )}
      </div>
      <span className="atm-scrub-label">
        <span className="atm-scrub-time">{fmtAbs(activeTime)}</span>
        <span className="atm-scrub-rel">{rel}</span>
      </span>
      <span className="atm-scrub-end">+48h</span>
    </div>
  );
}

// --- Tour-/GPX-Import (A) — setzt Ort/Marker aus einer Tourdatei --------------

function TourImportButton() {
  const { setLocation } = useAtmosphere();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // erneuter Upload derselben Datei erlauben
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

// --- Ort-Suche (kompakt, DACH) — gleiches Muster wie übrige Features ----------

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
