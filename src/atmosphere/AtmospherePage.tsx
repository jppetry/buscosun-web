/**
 * Atmosphäre · Feature-Shell.
 *
 * Ohne Ort: Schritt 1 im Deck-Rahmen (Ablauf + Ort-/Tour-Einstieg). Mit Ort: das
 * „Command-Deck" (AtmosphereDeck) — Karte mit Schnitt-Anleitung, danach der
 * Vertikalschnitt; Höhenwind · Inversion · Go/No-Go · Föhn · Thermik in der linken Leiste.
 * Das alte Split-/Grid-Layout ist vom Deck abgelöst; die Datenpfade bleiben
 * (Store, Cross-Section, Sounding-Profil, Go/No-Go).
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import type { Location } from '../types';
import { geocodeDACH, flagForCountry } from '../geocode';
import { tourFileToCutLine } from '../threed/tourImport';
import { pickCountry } from '../pointForecast/clustering';
import { AtmosphereProvider, useAtmosphere } from './atmosphereStore';
import AtmosphereDeck, { CutHintArt, type DeckSub } from './AtmosphereDeck';
import type { AtmosphereUrlState } from './atmosphereUrl';
import type { Lens } from './atmosphereState';
import { FeatureRail, type RailFeature } from '../nav/featureRail';
import '../threed/threed.css';
import '../route/tourTheme.css';
import './atmosphere.css';
import './atmosphereDeck.css';

export type { DeckSub } from './AtmosphereDeck';

interface Props {
  onBack: () => void;
  onOpenFeature?: (id: RailFeature) => void;
  // --- Router (RT1), additiv: Linse aus `/atmosphaere/<lens>`, Unterlinse aus `?ansicht=` ---
  initialLens?: Lens | null;
  /** Linse von außen (nur Zurück/Vorwärts). */
  routeLens?: Lens | null;
  initialSub?: DeckSub | null;
  /** Unterlinse von aussen (nur Zurueck/Vorwaerts) — E7: /atmosphaere/arbeitsfenster. */
  routeSub?: DeckSub | null;
  onLensChange?: (lens: Lens, initial: boolean) => void;
  onSubChange?: (sub: DeckSub) => void;
  /** SH3: Anfangszustand aus Pfad + Query (Alt-Links hat der Wrapper schon umgeschrieben). */
  initialUrl?: AtmosphereUrlState | null;
  /** SH3: Zustandsänderung ⇒ der Wrapper schreibt die URL (einziger Schreiber). */
  onUrlState?: (s: AtmosphereUrlState) => void;
}

export default function AtmospherePage({ onBack, onOpenFeature, initialLens, routeLens, initialSub, routeSub, onLensChange, onSubChange, initialUrl, onUrlState }: Props) {
  return (
    <AtmosphereProvider initialLens={initialLens} routeLens={routeLens} onLensChange={onLensChange} initialUrl={initialUrl} onUrlState={onUrlState}>
      <AtmosphereShell onBack={onBack} onOpenFeature={onOpenFeature} initialSub={initialSub} routeSub={routeSub} onSubChange={onSubChange} />
    </AtmosphereProvider>
  );
}

function AtmosphereShell({ onBack, onOpenFeature, initialSub, routeSub, onSubChange }: Props) {
  const { location } = useAtmosphere();
  if (location) return <AtmosphereDeck onBack={onBack} onOpenFeature={onOpenFeature} initialSub={initialSub} routeSub={routeSub} onSubChange={onSubChange} />;

  // Schritt 1 im selben Deck-Rahmen wie Schritt 2/3 (Topbar · Rail · Bühne).
  return (
    <div className="vsd-root vsd-intro-root">
      <div className="vsd-topbar">
        <div className="vsd-brandwrap">
          <img src="/buscosun-mark.svg" width={26} height={26} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <button type="button" className="vsd-brand" onClick={onBack}>buscosun</button>
        </div>
        <div className="vsd-topdivider" />
        <span className="vsd-top-label">Atmosphäre · Vertikalschnitt</span>
        <div className="vsd-topright">
          <button type="button" className="vsd-toppill" onClick={onBack}>Zurück</button>
        </div>
      </div>
      <div className="vsd-body">
        <FeatureRail
          active="atmosphere"
          onOpenFeature={onOpenFeature}
          onHome={onBack}
          navClass="vsd-rail"
          btnClass="vsd-rail-btn"
          activeClass="vsd-rail-btn--active"
          spacerClass="vsd-rail-spacer"
        />
        <main className="vsd-intro-stage vsd-scroll">
          <AtmosphereIntro />
        </main>
      </div>
    </div>
  );
}

// --- Idle-Intro (Einstieg: Ablauf + Ort/Tour) --------------------------------

/** Die drei Schritte des Features — derselbe Ablauf wie in der Funktionsleiste. */
const ATM_FLOW = [
  { title: 'Ort wählen', text: 'Stadt, Adresse oder PLZ in DE, AT oder CH — oder eine Tour hochladen.' },
  { title: 'Schnitt ziehen', text: 'Auf der Karte zwei Punkte antippen, am besten quer über ein Tal oder einen Grat.' },
  { title: 'Atmosphäre ansehen', text: 'Höhenwind, Inversion und Go/No-Go entlang der Linie; Föhn und Thermik am Ort.' },
];

const ATM_INTRO_CAPS = [
  'Höhenwind-Geländeschnitt mit Vektoren, Isotachen, Shear & Wolkenbasis',
  'Inversion / Kaltluftsee — Temperatur-Umkehr, Nebelobergrenze, Aufstiegs-Delta',
  'Go/No-Go Betriebs-Check (B2B): Böen auf Arbeitshöhe, Grenzwerte, Zeitfenster',
  // V-FR-10: der Schnitt rechnet den Bodenwind von buscosun Fusion hoch; das Höhenprofil (Emagramm, Föhn) kommt aus ICON-EU.
  'Bodenwind aus buscosun Fusion, Höhenprofil aus ICON-EU-Druckflächen, Gelände (DEM) — werbefrei, keine Tracker',
];

function AtmosphereIntro() {
  return (
    <section className="vsd-intro">
      <div className="vsd-intro-main">
        <div className="vsd-eyebrow">Schritt 1 von 3</div>
        <h1 className="vsd-intro-title">Die Atmosphäre über dir</h1>
        <p className="vsd-intro-lead">
          Wähle einen Ort oder lade eine Tour (GPX/TCX/FIT) hoch — dann zeigen wir dir den
          Vertikalschnitt darüber: Höhenwind, Inversion und den Go/No-Go-Betriebs-Check über die
          nächsten Stunden, mit ehrlicher Einordnung.
        </p>

        <div className="vsd-intro-action">
          <LocationField />
          <TourImportButton />
        </div>

        <ol className="vsd-intro-flow" aria-label="So geht’s">
          {ATM_FLOW.map((s, i) => (
            <li key={s.title} className={i === 0 ? 'is-active' : ''}>
              <span className="vsd-intro-flow-num" aria-hidden="true">{i + 1}</span>
              <span className="vsd-intro-flow-tx"><b>{s.title}</b><span>{s.text}</span></span>
            </li>
          ))}
        </ol>
      </div>

      <aside className="vsd-intro-side">
        <CutHintArt />
        <div className="vsd-intro-caps-head">Was du am Schnitt siehst</div>
        <ul className="vsd-intro-caps">
          {ATM_INTRO_CAPS.map((c) => (
            <li key={c}><span className="vsd-intro-caps-mark" aria-hidden="true"><IconCheck /></span>{c}</li>
          ))}
        </ul>
        <p className="vsd-intro-trust"><span className="vsd-live-dot" aria-hidden="true" /> buscosun Fusion + ICON-EU + Gelände · werbefrei · keine Tracker</p>
      </aside>
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
