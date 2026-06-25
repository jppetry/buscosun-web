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

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { AtmosphereProvider, useAtmosphere } from './atmosphereStore';
import { LENSES, LENS_LABEL, HOUR_MIN, HOUR_MAX, type Lens } from './atmosphereState';
import '../route/tourTheme.css';
import './atmosphere.css';

interface Props { onBack: () => void }

export default function AtmospherePage({ onBack }: Props) {
  return (
    <AtmosphereProvider>
      <AtmosphereShell onBack={onBack} />
    </AtmosphereProvider>
  );
}

function AtmosphereShell({ onBack }: Props) {
  const { lens, location } = useAtmosphere();
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
        <header className="rt-intro">
          <span className="rt-eyebrow">Atmosphäre</span>
          <h1>Die Atmosphäre über dir</h1>
        </header>

        <div className="atm-head">
          <LensSwitcher />
          <div className="atm-head-right">
            <LocationField />
            <span className="atm-run">⏱ Modelllauf: <b>—</b></span>
          </div>
        </div>

        <div className="atm-grid">
          <Verdict />
          <GlobePlaceholder />
          <ProfilePlaceholder />
          <NerdMode />
        </div>

        {location && <Scrubber />}
        {!location && (
          <div className="atm-ph" style={{ marginTop: '1rem' }}>
            Suche oben einen Ort, um die Atmosphäre und den Zeit-Scrubber zu aktivieren.
          </div>
        )}
      </main>
    </div>
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

// --- Verdict (Tiefe 1, Platzhalter in P1) ------------------------------------

const VERDICT_PLACEHOLDER: Record<Lens, string> = {
  fly: 'Thermik, Wind und Wolkenbasis fürs Fliegen',
  mountain: 'Inversion, Nebelmeer und Nullgradgrenze für Berg & Weg',
  sky: 'Sonnenuntergangs-Qualität, Nebelmeer und Himmelsoptik',
};

function Verdict() {
  const { lens } = useAtmosphere();
  return (
    <section className="rt-card atm-verdict" aria-label="Verdict">
      <p className="atm-verdict-line">
        <span className="atm-verdict-dot is-watch" aria-hidden="true" />
        {LENS_LABEL[lens]} — Einschätzung folgt
      </p>
      <p className="atm-verdict-sub">{VERDICT_PLACEHOLDER[lens]} (Tiefe 1, ab P3).</p>
    </section>
  );
}

// --- Globe / Terrain (Platzhalter in P1) -------------------------------------

function GlobePlaceholder() {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <section className={`rt-card atm-globe${collapsed ? ' is-collapsed' : ''}`} aria-label="3D-Globe / Terrain">
      <button
        type="button" className="atm-globe-fs"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? '⤢ Vollbild' : '× Schließen'}
      </button>
      <div className="atm-globe-ph">
        <strong>3D-Globe / Terrain</strong>
        Wind, Wolken & Thermik — Platzhalter (MapLibre-Layer ab P4).
      </div>
    </section>
  );
}

// --- Vertikalprofil (Platzhalter in P1) --------------------------------------

function ProfilePlaceholder() {
  return (
    <section className="rt-card atm-profile-box" aria-label="Vertikalprofil">
      <span className="rt-eyebrow">Vertikalprofil</span>
      <div className="atm-ph" style={{ marginTop: '0.6rem' }}>
        Emagramm (Meter · km/h · °C) — Platzhalter. Kommt in P2 aus dem ICON-EU-Sounding
        plus abgeleitetem 3D-Schnitt.
      </div>
    </section>
  );
}

// --- Nerd-Mode (Tiefe 3, Platzhalter in P1) ----------------------------------

function NerdMode() {
  const { nerdOpen, setNerdOpen } = useAtmosphere();
  return (
    <section className="rt-card atm-nerd" aria-label="Nerd-Mode">
      <button
        type="button" className="atm-nerd-toggle"
        aria-expanded={nerdOpen} onClick={() => setNerdOpen(!nerdOpen)}
      >
        {nerdOpen ? '▾' : '▸'} Werte anzeigen (Nerd-Mode)
      </button>
      {nerdOpen && (
        <div className="atm-nerd-body">
          Skew-T/Log-P, CAPE/CIN, rohe Level-Werte und Lauf-Alter — Platzhalter (ab P7).
        </div>
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
function relLabel(hour: number): string {
  if (hour <= 0) return 'jetzt';
  if (hour < 24) return `in ${hour} h`;
  const d = Math.round(hour / 24);
  return `in ${d} Tag${d > 1 ? 'en' : ''}`;
}

function Scrubber() {
  const { hour, setHour } = useAtmosphere();
  // Stable "now" base, rounded down to the full hour (computed once on mount).
  const baseMs = useMemo(() => { const d = new Date(); d.setMinutes(0, 0, 0); return d.getTime(); }, []);
  const activeTime = new Date(baseMs + hour * 3_600_000);
  const nowPct = ((0 - HOUR_MIN) / (HOUR_MAX - HOUR_MIN)) * 100;

  return (
    <div className="atm-scrub">
      <div className="atm-scrub-track">
        <input
          type="range" className="atm-scrub-range"
          min={HOUR_MIN} max={HOUR_MAX} step={1} value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          aria-label="Vorhersagezeitpunkt (Stunden ab jetzt)"
          aria-valuetext={`${relLabel(hour)} · ${fmtAbs(activeTime)}`}
        />
        <span className="atm-scrub-now" style={{ left: `${nowPct}%` }} aria-hidden="true">
          <span className="atm-scrub-now-label" style={{ left: 0 }}>jetzt</span>
        </span>
      </div>
      <span className="atm-scrub-label">
        <span className="atm-scrub-time">{fmtAbs(activeTime)}</span>
        <span className="atm-scrub-rel">{relLabel(hour)}</span>
      </span>
      <span className="atm-scrub-end">+48h</span>
    </div>
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
