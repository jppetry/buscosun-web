/**
 * Buscosun Startseite v3.0 — „Kommando-Deck".
 *
 * Redesign nach design_handoff_startseite (references/desktop|tablet|mobile.dc.html):
 * eine Kommandozentrale statt Landingpage. Aufbau von oben nach unten:
 *   - Command-Bar: Logo · ⌘K-Trigger · „DATEN LIVE" · DE/EN
 *   - Hero: Eyebrow · Wortmarke · Sub · große Ortssuche (+ Direkt-Link Wetterkarte)
 *   - Filter-Chips: Alle / Karten & Radar / Planen / Verstehen / Erkunden
 *   - Bento-Grid: 9 Werkzeug-Kacheln (Desktop 4-Spalten, Tablet 3, Mobile 1–2)
 *   - Fundament (Fusion Forecast) · „Ehrlich bleiben" · Footer
 *   - ⌘K-Command-Palette (Overlay) · Mobile-Bottom-Tab-Bar
 *
 * ALLE bestehenden Verdrahtungen bleiben erhalten und werden weitergenutzt:
 *   onSelect (Geocode-Flow), onOpenFeature (jede Kachel + Palette-Eintrag),
 *   warmMapData()-Warm-up, lazy HeroMapBackground, Favoriten, Intro-Tour.
 * Kein Tile/Palette-Eintrag zeigt ins Leere — jede Ziel-ID existiert in
 * App.tsx (FeatureId). Das Mock-Tile „KI-Meteorologe" hat kein reales Feature;
 * an seiner Stelle steht die bestehende Feedback-Kachel (Entscheidung Jan).
 */

import {
  lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState,
  type FormEvent, type ReactNode,
} from 'react';
import type { Location, NominatimResult } from './types';
import type { FeatureInfo } from './App';
import { parseCountry } from './countryProfiles';
// Deko-Hero-Karte lazy: maplibre-gl bleibt aus dem Initial-Bundle (eigener Chunk).
const HeroMapBackground = lazy(() => import('./HeroMapBackground'));
// Touch-Geräte: die rein dekorative Hintergrundkarte gar nicht laden (SVG genügt).
const SHOW_HERO_MAP = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && !window.matchMedia('(pointer: coarse)').matches;
import { warmMapData } from './fusion/loadFusedForecast';
import { flagForCountry } from './geocode';
import { getFavorites, removeFavorite } from './favorites';
import { useIntroTour, type IntroTour } from './intro/useIntroTour';
import IntroOverlay from './intro/IntroOverlay';
import './mobile/safeArea.css';
import './SearchPage.css';

interface Props {
  onSelect: (location: Location) => void;
  onOpenFeature: (feature: FeatureInfo) => void;
}

function toLocation(r: NominatimResult): Location | null {
  const country = parseCountry(r.address?.country_code);
  if (!country) return null;
  return {
    name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    country,
  };
}

// ============================================================================
// FEATURE-ZIELE — Single Source of Truth für jede Kachel & jeden Palette-Eintrag.
// Jede `feature`-Definition entspricht einer realen FeatureId aus App.tsx.
// ============================================================================
type Category = 'radar' | 'planen' | 'verstehen' | 'erkunden';

const FEATURE: Record<string, FeatureInfo> = {
  map2d:      { id: 'map2d',      eyebrow: 'Wetterkarte',   title: 'Die ganze DACH-Wetterkarte' },
  route:      { id: 'route',      eyebrow: 'Tourenplanung', title: 'Wetter entlang deiner Route' },
  event:      { id: 'event',      eyebrow: 'Event-Planung', title: 'Welcher Tag passt am besten?' },
  nowcast:    { id: 'nowcast',    eyebrow: 'Regenradar',    title: 'Regnet es in 40 Minuten?' },
  forecast:   { id: 'forecast',   eyebrow: 'Vorhersage',    title: 'Konfidenz & Modelle' },
  history:    { id: 'history',    eyebrow: 'Historie',      title: 'Klima seit 1940' },
  atmosphere: { id: 'atmosphere', eyebrow: 'Atmosphäre',    title: 'Die Atmosphäre über dir' },
  globe:      { id: 'globe',      eyebrow: '3D-Globus',     title: 'Das Wetter der ganzen Erde' },
  feedback:   { id: 'feedback',   eyebrow: 'Feedback',      title: 'Ideen & Vorschläge' },
  validation: { id: 'validation', eyebrow: 'Validierung',   title: 'Wie gut ist der KI-Nowcast wirklich?' },
};

interface PaletteEntry { num: string; label: string; hint: string; feature: FeatureInfo; }
const PALETTE: PaletteEntry[] = [
  { num: '01', label: 'Wetterkarte',            hint: 'Wind · Regen · Blitze',      feature: FEATURE.map2d },
  { num: '02', label: 'Tourenplanung',          hint: 'Wetter pro km · E-Bike',     feature: FEATURE.route },
  { num: '03', label: 'Event-Planung',          hint: 'Bester Tag · Plan B',        feature: FEATURE.event },
  { num: '04', label: 'Regenradar / Nowcast',   hint: 'Regen 0–6 h',                feature: FEATURE.nowcast },
  { num: '05', label: 'Vorhersage & Konfidenz', hint: 'Modell · Spread',            feature: FEATURE.forecast },
  { num: '06', label: 'Historie',               hint: 'Klima seit 1940',            feature: FEATURE.history },
  { num: '07', label: 'Atmosphäre',             hint: 'Höhenwind · Föhn',           feature: FEATURE.atmosphere },
  { num: '08', label: '3D-Globus',              hint: 'Sample-Daten',               feature: FEATURE.globe },
  { num: '09', label: 'Feedback',               hint: 'Ideen & Vorschläge',         feature: FEATURE.feedback },
  { num: '10', label: 'Validierung',            hint: 'Wie gut ist der Nowcast?',   feature: FEATURE.validation },
];

// ============================================================================
// ROOT
// ============================================================================
export default function SearchPage({ onSelect, onOpenFeature }: Props) {
  const tour = useIntroTour();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<'alle' | Category>('alle');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Volles Warm-up beim Mount der Startseite (DEM-Tiles, Primary/Secondary-
    // Sources, Phase-A-Fusion für DE). MapView öffnet dann bei DE-Klick instant.
    warmMapData();
  }, []);

  // Den schweren MapView-Chunk im Leerlauf vorwärmen, während der Nutzer sucht.
  useEffect(() => {
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return;
    const ric: (cb: () => void) => number =
      typeof window.requestIdleCallback === 'function'
        ? (cb) => window.requestIdleCallback(cb, { timeout: 3000 })
        : (cb) => window.setTimeout(cb, 1200);
    const cancel: (id: number) => void =
      typeof window.cancelIdleCallback === 'function'
        ? (id) => window.cancelIdleCallback(id)
        : (id) => window.clearTimeout(id);
    const id = ric(() => { void import('./MapView'); });
    return () => cancel(id);
  }, []);

  // ⌘K / Ctrl-K global: Palette togglen. Esc schließt (auch aus der Palette).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openFeature = useCallback((f: FeatureInfo) => {
    setPaletteOpen(false);
    onOpenFeature(f);
  }, [onOpenFeature]);

  const focusSearch = useCallback(() => {
    setPaletteOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Nach dem Scroll fokussieren, damit das Feld sicher im Viewport steht.
    window.setTimeout(() => searchInputRef.current?.focus(), 260);
  }, []);

  return (
    <div className="deck">
      {/* Sehr dezente, lazy geladene Deko-Karte hinter Command-Bar + Hero.
          Bleibt gemountet, um Warm-up/Chunk-Verhalten zu erhalten; per Scrim
          zur Sandfläche ausgeblendet, damit die Kacheln auf reinem Sand sitzen. */}
      {SHOW_HERO_MAP && (
        <Suspense fallback={null}>
          <HeroMapBackground />
        </Suspense>
      )}

      <CommandBar onOpenPalette={() => setPaletteOpen(true)} />

      <main className="deck-main">
        <Hero onSelect={onSelect} onOpenFeature={openFeature} inputRef={searchInputRef} tour={tour} />
        <FilterChips active={activeCat} onChange={setActiveCat} />
        <BentoGrid activeCat={activeCat} onOpenFeature={openFeature} />
        <Fundament />
        <Honesty />
      </main>

      <DeckFooter onOpenFeature={openFeature} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenFeature={openFeature}
      />
      <MobileTabBar onOpenFeature={openFeature} onSearch={focusSearch} />

      <IntroOverlay tour={tour} />
    </div>
  );
}

// ============================================================================
// LOGO
// ============================================================================
function LogoMark({ size = 26 }: { size?: number }) {
  return <img className="deck-logo-mark" src="/buscosun-mark.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <line x1="12.5" y1="12.5" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================================
// COMMAND BAR — Logo · ⌘K-Trigger · „DATEN LIVE" · DE/EN
// ============================================================================
function CommandBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="deck-bar">
      <div className="deck-bar-inner">
        <a className="deck-brand" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <LogoMark size={26} />
          <span className="deck-wordmark">buscosun</span>
        </a>

        <button type="button" className="deck-kbar" onClick={onOpenPalette} aria-label="Befehls-Palette öffnen (⌘K)" aria-keyshortcuts="Meta+K Control+K">
          <span className="deck-kbar-icon"><SearchIcon size={16} /></span>
          <span className="deck-kbar-text">Ort suchen oder Werkzeug springen …</span>
          <kbd className="deck-kbd">⌘K</kbd>
        </button>

        <div className="deck-bar-right">
          <span className="deck-live"><span className="deck-live-dot" aria-hidden="true" />DATEN LIVE</span>
          <span className="deck-lang"><span className="is-active">DE</span><span className="sep">·</span><span>EN</span></span>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// HERO — Eyebrow · Wortmarke · Sub · große Ortssuche · Favoriten · Intro-Tour
// ============================================================================
interface HeroProps {
  onSelect: (loc: Location) => void;
  onOpenFeature: (f: FeatureInfo) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  tour: IntroTour;
}
function Hero({ onSelect, onOpenFeature, inputRef, tour }: HeroProps) {
  return (
    <section className="deck-hero" id="top">
      <div className="deck-hero-eyebrow">LIVE · DE · AT · CH · OHNE ACCOUNT</div>
      <h1 className="deck-h1">buscosun</h1>
      <p className="deck-hero-sub">
        Modelle, Live-Stationen und Höhenkorrektur — zu einem Feld verschmolzen.
        Suche einen Ort oder steig direkt in ein Werkzeug ein.
      </p>

      <HeroSearch onSelect={onSelect} onOpenFeature={onOpenFeature} inputRef={inputRef} />
      <HeroFavorites onSelect={onSelect} />
      <IntroTrigger tour={tour} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Ortssuche — bestehende Geocode-Logik, neu als Hero-Pille gestylt.
// ---------------------------------------------------------------------------
interface HeroSearchProps {
  onSelect: (loc: Location) => void;
  onOpenFeature: (f: FeatureInfo) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}
function HeroSearch({ onSelect, onOpenFeature, inputRef }: HeroSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setResults([]); setError(null); }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setResults([]);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', q);
      url.searchParams.set('format', 'json');
      url.searchParams.set('countrycodes', 'de,at,ch');
      url.searchParams.set('limit', '8');
      url.searchParams.set('addressdetails', '1');
      const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'de' } });
      if (!res.ok) throw new Error(`Geocoder: ${res.status}`);
      const data = (await res.json()) as NominatimResult[];
      const usable = data.filter((r) => parseCountry(r.address?.country_code) != null);
      if (usable.length === 0) {
        setError('Keine Ergebnisse in DE / AT / CH gefunden.');
      } else if (usable.length === 1) {
        const loc = toLocation(usable[0]);
        if (loc) onSelect(loc); else setError('Land konnte nicht erkannt werden.');
      } else {
        setResults(usable);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  function pickResult(r: NominatimResult) {
    const loc = toLocation(r);
    if (loc) onSelect(loc); else setError('Land konnte nicht erkannt werden.');
  }

  const showDropdown = results.length > 0 || error != null;

  return (
    <div className={`deck-search-wrap${showDropdown ? ' has-dropdown' : ''}`} ref={wrapRef}>
      <form className="deck-search" onSubmit={handleSubmit} role="search">
        <span className="deck-search-icon"><SearchIcon size={19} /></span>
        <input
          ref={inputRef}
          type="text"
          className="deck-search-input"
          placeholder="Stadt, Straße oder PLZ …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          aria-label="Standort suchen"
        />
        <button type="submit" className="deck-search-go" disabled={loading || !query.trim()}>
          {loading ? 'Suche …' : 'Öffnen'}
          {!loading && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <line x1="1" y1="6" x2="10" y2="6" /><polyline points="6,2 10,6 6,10" />
            </svg>
          )}
        </button>
      </form>

      {showDropdown && (
        <div className="deck-search-dropdown" role="listbox">
          {error && <div className="deck-search-error">⚠ {error}</div>}
          {results.map((r) => (
            <button key={r.place_id} type="button" className="deck-search-result" onClick={() => pickResult(r)}>
              <span className="deck-flag" aria-hidden="true">{flagFor(r.address?.country_code)}</span>
              <span className="deck-result-name">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="deck-search-foot">
        <span className="deck-kbd sm">↵</span>
        <span>Enter zum Suchen · Live-Daten aus DE · AT · CH · oder direkt in die{' '}
          <button type="button" className="deck-inline-link" onClick={() => onOpenFeature(FEATURE.map2d)}>
            DACH-Wetterkarte
          </button>
        </span>
      </div>
    </div>
  );
}

function flagFor(cc?: string): string {
  switch (cc?.toLowerCase()) {
    case 'de': return '🇩🇪';
    case 'at': return '🇦🇹';
    case 'ch': return '🇨🇭';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Gespeicherte Orte (Favoriten) — Ein-Klick zur Karte. Erhalten aus v2.
// ---------------------------------------------------------------------------
function HeroFavorites({ onSelect }: { onSelect: (location: Location) => void }) {
  const [favs, setFavs] = useState<Location[]>(() => getFavorites());
  if (favs.length === 0) return null;
  return (
    <div className="deck-favs">
      <span className="deck-favs-label">Gespeichert</span>
      {favs.map((f) => (
        <span key={`${f.lat},${f.lon}`} className="deck-fav-chip">
          <button type="button" className="deck-fav-open" onClick={() => onSelect(f)} title={f.name}>
            <span aria-hidden="true">{flagForCountry(f.country)}</span>
            <span className="deck-fav-name">{f.name.split(',')[0]}</span>
          </button>
          <button type="button" className="deck-fav-x" aria-label={`${f.name} entfernen`} onClick={() => setFavs(removeFavorite(f))}>×</button>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intro-Tour-Trigger (dezent, Erstbesuch: einmaliger Puls). Erhalten aus v2.
// ---------------------------------------------------------------------------
function IntroTrigger({ tour }: { tour: IntroTour }) {
  return (
    <button type="button" className={`deck-intro${tour.pulse ? ' is-pulse' : ''}`} onClick={tour.start}>
      <span className="deck-intro-spark" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5 L9.4 6.6 L14.5 8 L9.4 9.4 L8 14.5 L6.6 9.4 L1.5 8 L6.6 6.6 Z" />
        </svg>
      </span>
      Entdecke buscosun
    </button>
  );
}

// ============================================================================
// FILTER CHIPS — Kategorien dimmen die Kacheln (kein Reflow).
// ============================================================================
const CHIPS: Array<{ key: 'alle' | Category; label: string }> = [
  { key: 'alle', label: 'Alle' },
  { key: 'radar', label: 'Karten & Radar' },
  { key: 'planen', label: 'Planen' },
  { key: 'verstehen', label: 'Verstehen' },
  { key: 'erkunden', label: 'Erkunden' },
];
function FilterChips({ active, onChange }: { active: 'alle' | Category; onChange: (c: 'alle' | Category) => void }) {
  return (
    <section className="deck-chips" aria-label="Werkzeuge filtern">
      <span className="deck-chips-count">09 WERKZEUGE</span>
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`deck-chip${active === c.key ? ' is-active' : ''}`}
          aria-pressed={active === c.key}
          onClick={() => onChange(c.key)}
        >
          {c.label}
        </button>
      ))}
    </section>
  );
}

// ============================================================================
// BENTO GRID — 9 Werkzeug-Kacheln. DOM-Reihenfolge = Mock-Desktop; Tablet
// ordnet per CSS `order` um; Mobile stapelt (3D+Globus als Paar).
// ============================================================================
function BentoGrid({ activeCat, onOpenFeature }: { activeCat: 'alle' | Category; onOpenFeature: (f: FeatureInfo) => void }) {
  // Dim-Logik: bei aktivem Filter alles ausblenden, was nicht zur Kategorie passt.
  const dim = (cats: Category[]) => activeCat !== 'alle' && !cats.includes(activeCat);

  const tile = (cats: Category[], cls: string, feature: FeatureInfo, ariaLabel: string, children: ReactNode) => (
    <button
      type="button"
      className={`deck-tile ${cls}${dim(cats) ? ' is-dim' : ''}`}
      aria-label={ariaLabel}
      aria-hidden={dim(cats) || undefined}
      tabIndex={dim(cats) ? -1 : undefined}
      onClick={() => onOpenFeature(feature)}
    >
      {children}
    </button>
  );

  return (
    <section className="deck-bento" aria-label="Werkzeuge">
      {/* 01 · WETTERKARTE — groß (2×2) */}
      {tile(['radar'], 'tile-karte t-lg', FEATURE.map2d, 'Wetterkarte öffnen',
        <>
          <div className="tile-head">
            <div>
              <div className="tile-eyebrow">01 · WETTERKARTE</div>
              <div className="tile-title tile-title-xl">Die ganze DACH-Wetterkarte</div>
            </div>
            <span className="tile-badge badge-live">● Regenradar an</span>
          </div>
          <p className="tile-desc">Wind, Niederschlag, Temperatur (höhenkorrigiert), Wolken, Satellit, Blitze und Stationen — mit Zeit-Slider und Modellwahl je Land. Direkt-Einstieg ohne Ortssuche.</p>
          <div className="tile-map">
            <svg viewBox="0 0 600 320" preserveAspectRatio="none" className="tile-map-svg" aria-hidden="true">
              <g fill="none" stroke="var(--steel-600)" strokeWidth="1.5" strokeOpacity=".5">
                <path d="M30 100 C160 60 380 140 580 90" /><path d="M30 160 C160 120 380 200 580 150" /><path d="M30 220 C160 180 380 260 580 210" />
              </g>
              <g fill="var(--terracotta-500)" fillOpacity=".45"><circle cx="200" cy="150" r="40" /><circle cx="440" cy="220" r="52" /></g>
              <g fill="var(--amber-500)"><circle cx="120" cy="220" r="4" /><circle cx="300" cy="170" r="4" /><circle cx="480" cy="120" r="4" /><circle cx="240" cy="260" r="4" /><circle cx="380" cy="90" r="4" /></g>
            </svg>
            <span className="tile-map-tag">2D · MAPLIBRE · DWD ICON-D2 · RADOLAN-RV</span>
          </div>
          <div className="tile-tags">
            {['Wind', 'Niederschlag', 'Temperatur', 'Wolken', 'Satellit', 'Blitze', 'Stationen'].map((t) => (
              <span key={t} className="tile-tag">{t}</span>
            ))}
          </div>
        </>)}

      {/* 02 · TOURENPLANUNG — dunkel, span 2 */}
      {tile(['planen'], 'tile-tour t-w2 t-ink', FEATURE.route, 'Tourenplanung öffnen',
        <>
          <div className="tile-head">
            <div>
              <div className="tile-eyebrow">02 · TOURENPLANUNG</div>
              <div className="tile-title tile-title-lg">Wetter entlang deiner Route</div>
            </div>
            <span className="tile-badge badge-mono-ghost">E-BIKE</span>
          </div>
          <p className="tile-desc on-ink">GPX/TCX/FIT/KML hochladen — Wind, Regen und Temperatur pro km zur echten Ankunftszeit. 8 Bewegungsarten, E-Bike-Akku-Reichweite, Pausenplanung, Rücken-/Gegenwind.</p>
          <svg viewBox="0 0 520 70" preserveAspectRatio="none" className="tile-route-svg" aria-hidden="true">
            <path d="M0 56 L70 38 L140 48 L210 18 L290 32 L360 22 L440 40 L520 12" fill="none" stroke="var(--amber-500)" strokeWidth="2.5" />
            <circle cx="210" cy="18" r="4" fill="var(--terracotta-500)" /><circle cx="440" cy="40" r="4" fill="var(--steel-600)" />
          </svg>
        </>)}

      {/* 03 · EVENT-PLANUNG — weiß, span 2 */}
      {tile(['planen'], 'tile-event t-w2', FEATURE.event, 'Event-Planung öffnen',
        <>
          <div>
            <div className="tile-eyebrow">03 · EVENT-PLANUNG</div>
            <div className="tile-title tile-title-lg">Welcher Tag passt am besten?</div>
            <p className="tile-desc">Anlass + Ort + Zeitfenster → 7-Tage-Score. Phasen (Trauung/Empfang/Abendfeier) einzeln bewertet, Plan B, Regen-/Wind-/Hitze-Hazards, Foto-Licht & Astro-Nacht.</p>
          </div>
          <div className="tile-bars">
            {[40, 64, 100, 52, 76, 34, 58].map((h, i) => (
              <span key={i} className={`tile-bar${h === 100 ? ' is-best' : h >= 64 ? ' is-mid' : ''}`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </>)}

      {/* 04 · NOWCAST / Regenradar */}
      {tile(['radar'], 'tile-nowcast', FEATURE.nowcast, 'Regenradar / Nowcast öffnen',
        <>
          <div className="tile-eyebrow">04 · NOWCAST</div>
          <div className="tile-radar">
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="none" stroke="var(--sand-200)" /><circle cx="32" cy="32" r="20" fill="none" stroke="var(--sand-200)" /><circle cx="32" cy="32" r="10" fill="none" stroke="var(--sand-200)" />
              <circle cx="32" cy="32" r="3" fill="var(--steel-600)" />
              <line x1="32" y1="32" x2="58" y2="24" stroke="var(--steel-600)" strokeWidth="1.5" className="tile-radar-sweep" />
            </svg>
          </div>
          <div>
            <div className="tile-title tile-title-sm">Regnet es in 40 Min?</div>
            <p className="tile-desc sm">0–2 h Radar, 2–6 h ICON-D2. Blitz- & Sturm-Alerts, alpine Tal/Grat-Trennung.</p>
          </div>
        </>)}

      {/* 05 · VORHERSAGE */}
      {tile(['verstehen'], 'tile-forecast t-cream', FEATURE.forecast, 'Vorhersage & Konfidenz öffnen',
        <>
          <div className="tile-eyebrow">05 · VORHERSAGE</div>
          <div className="tile-donut-row">
            <svg width="58" height="58" viewBox="0 0 56 56" aria-hidden="true">
              <circle cx="28" cy="28" r="22" fill="none" stroke="var(--sand-200)" strokeWidth="6" />
              <circle cx="28" cy="28" r="22" fill="none" stroke="var(--sage-600)" strokeWidth="6" strokeLinecap="round" strokeDasharray="138 138" strokeDashoffset="34" transform="rotate(-90 28 28)" />
            </svg>
            <div className="tile-donut-val">78%<span>Trefferquote 3 Tage</span></div>
          </div>
          <div>
            <div className="tile-title tile-title-sm">Konfidenz & Modelle</div>
            <p className="tile-desc sm">ICON-D2 + MOSMIX + ICON-EU, Unsicherheitsband, Hit-Rate-Rückblick. Einfach/Experte.</p>
          </div>
        </>)}

      {/* 06 · HISTORIE */}
      {tile(['verstehen'], 'tile-history', FEATURE.history, 'Historie öffnen',
        <>
          <div className="tile-eyebrow">06 · HISTORIE</div>
          <div className="tile-stripes" aria-hidden="true">
            {['#3A6FA8', '#4A6E93', '#6B7A8F', '#8B8A80', '#A89A7A', '#C9A878', '#D4A373', '#C97B47', '#B96A3C', '#A85E2E'].map((c, i) => (
              <span key={i} style={{ background: c }} />
            ))}
          </div>
          <div>
            <div className="tile-title tile-title-sm">Klima seit 1940</div>
            <p className="tile-desc sm">ERA5: Warming-Stripes, Anomalien, Kenntage, Rekorde, Trends, Windrose.</p>
          </div>
        </>)}

      {/* 07 · 3D-WETTER → Atmosphäre */}
      {tile(['erkunden'], 'tile-threed t-half', FEATURE.atmosphere, 'Atmosphäre / 3D-Wetter öffnen',
        <>
          <div className="tile-head">
            <div className="tile-eyebrow">07 · 3D-WETTER</div>
            <span className="tile-badge badge-solid">Föhn</span>
          </div>
          <svg viewBox="0 0 220 70" preserveAspectRatio="none" className="tile-terrain-svg" aria-hidden="true">
            <path d="M0 68 L60 40 L110 20 L150 34 L220 60 L220 70 L0 70 Z" fill="var(--sand-100)" stroke="var(--border-strong)" />
            <g stroke="var(--steel-600)" strokeWidth="1.4" strokeOpacity=".6"><line x1="30" y1="16" x2="50" y2="14" /><line x1="90" y1="12" x2="112" y2="9" /><line x1="150" y1="14" x2="172" y2="11" /></g>
            <path d="M110 20 L150 34" stroke="var(--terracotta-500)" strokeWidth="2" />
          </svg>
          <div>
            <div className="tile-title tile-title-sm">Vertikalschnitt</div>
            <p className="tile-desc sm">Höhenwind, Inversion, Wolkenschichten, Windscherung, Föhn-Durchgriff. Gelände-Modus.</p>
          </div>
        </>)}

      {/* 08 · GLOBUS */}
      {tile(['erkunden'], 'tile-globus t-half', FEATURE.globe, '3D-Globus öffnen',
        <>
          <div className="tile-eyebrow">08 · GLOBUS</div>
          <div className="tile-center">
            <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
              <circle cx="30" cy="30" r="26" fill="var(--sand-100)" stroke="var(--border-strong)" />
              <g fill="none" stroke="var(--slate-500)" strokeWidth="1" strokeOpacity=".7"><ellipse cx="30" cy="30" rx="10" ry="26" /><ellipse cx="30" cy="30" rx="22" ry="26" /><line x1="4" y1="30" x2="56" y2="30" /><path d="M9 17 H51 M9 43 H51" /></g>
            </svg>
          </div>
          <div>
            <div className="tile-title tile-title-sm">3D-Globus</div>
            <p className="tile-desc sm">Wind-Partikel + Temperatur. <span className="tile-caveat">Sample-Felder — keine Live-Vorhersage.</span></p>
          </div>
        </>)}

      {/* 09 · FEEDBACK (an Stelle des Mock-Tiles „KI-Meteorologe") — dunkel, span 2 */}
      {tile([], 'tile-feedback t-w2 t-ink2', FEATURE.feedback, 'Feedback geben',
        <>
          <div className="tile-feedback-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z" fill="var(--amber-500)" />
            </svg>
          </div>
          <div className="tile-feedback-body">
            <div className="tile-eyebrow">09 · FEEDBACK</div>
            <div className="tile-title tile-title-lg">Ideen, Wünsche & Fehler melden</div>
            <p className="tile-desc on-ink">Was sollen wir verbessern, was fehlt dir? Schick uns deine Anregung direkt per E-Mail — ohne Konto, ohne Tracker. Jede Rückmeldung fließt in die nächste Ausbaustufe.</p>
          </div>
          <span className="tile-badge badge-mono-ghost">E-MAIL</span>
        </>)}
    </section>
  );
}

// ============================================================================
// FUNDAMENT · FUSION FORECAST
// ============================================================================
function Fundament() {
  return (
    <section className="deck-fundament" aria-label="Fundament">
      <div className="deck-fundament-inner">
        <div className="deck-eyebrow-line">DAS FUNDAMENT · FUSION FORECAST</div>
        <h2 className="deck-h2">Wie aus vielen Quellen ein Feld wird</h2>
        <p className="deck-lead">Mehrere Modelle und Live-Stationen werden clientseitig zu einem dichten Gitterfeld pro Vorhersagestunde verschmolzen — deterministisch, ohne Backend. Kein „bestes Modell", nur additive Information.</p>
        <div className="deck-steps">
          <div className="deck-step"><div className="deck-step-num">01 · 02</div><div className="deck-step-title">Quellen wählen & laden</div><p>DE → DWD, AT → GeoSphere AROME/INCA, CH → MeteoSwiss. Parallel, fehlertolerant, 10-min-Cache.</p></div>
          <div className="deck-step"><div className="deck-step-num">03 · 04</div><div className="deck-step-title">Gewichten & interpolieren</div><p>Live-Messungen dominieren Stunde 0, Modelle tragen den Horizont. IDW + Barnes-Glättung.</p></div>
          <div className="deck-step"><div className="deck-step-num">05 · 06</div><div className="deck-step-title">Physik & Kodierung</div><p>Höhenkorrektur per DEM, speed-erhaltender Wind, temporaler Median — als PNG-Textur an die Karte.</p></div>
        </div>
        <div className="deck-pills">
          <span className="deck-pill">Höhenkorrektur (Lapse-Rate + DEM)</span>
          <span className="deck-pill accent">Föhn-Detektor</span>
          <span className="deck-pill">Niederschlagsart (Schneefallgrenze)</span>
          <span className="deck-pill">Gefühlte Temperatur</span>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// EHRLICH BLEIBEN — alle 6 Punkte
// ============================================================================
const HONESTY: Array<{ tone: 'warn' | 'ok'; head: string; body: string }> = [
  { tone: 'warn', head: 'UV, Pollen & amtliche Warnungen', body: 'Nur Deutschland (DWD). AT/CH bekommen das nicht.' },
  { tone: 'warn', head: 'AT/CH Raster-Horizont', body: 'Karten ~1–2 Tage; weiter draußen nur Punkt-Blend.' },
  { tone: 'warn', head: 'Globus = Sample-Daten', body: 'Keine echte globale Live-Vorhersage.' },
  { tone: 'warn', head: 'Kein Backend', body: 'Kein zuverlässiges Push, keine Accounts/Sync — nur localStorage.' },
  { tone: 'warn', head: 'Kein offizielles Briefing', body: 'Kein METAR/TAF, Lawinen- oder Seegangsbericht.' },
  { tone: 'ok', head: 'Dafür: ehrliche Unsicherheit', body: 'Spread, Konfidenz und Hit-Rate offen ausgewiesen.' },
];
function Honesty() {
  return (
    <section className="deck-honesty" aria-label="Grenzen">
      <div className="deck-honesty-card">
        <div className="deck-honesty-head">
          <h2 className="deck-h3">Ehrlich bleiben — was wir <em>nicht</em> können</h2>
          <span className="deck-honesty-cov">ABDECKUNG · DE · AT · CH</span>
        </div>
        <div className="deck-honesty-grid">
          {HONESTY.map((h) => (
            <div key={h.head} className="deck-honesty-item">
              <span className={`deck-honesty-mark ${h.tone}`} aria-hidden="true">{h.tone === 'ok' ? '●' : '▲'}</span>
              <div><div className="deck-honesty-title">{h.head}</div><div className="deck-honesty-body">{h.body}</div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// FOOTER — Quellen · Werkzeuge · Rechtliches (inkl. Feedback/Validierung) ·
// MapLibre/OSM-Attribution.
// ============================================================================
function DeckFooter({ onOpenFeature }: { onOpenFeature: (f: FeatureInfo) => void }) {
  return (
    <footer className="deck-footer">
      <div className="deck-footer-top">
        <div className="deck-footer-brand">
          <div className="deck-footer-logo"><LogoMark size={22} /><span>buscosun</span></div>
          <p>Reine Frontend-Web-App für DACH. Kein Account · keine Tracker · Einstellungen bleiben lokal (localStorage).</p>
          <span className="deck-footer-version">v0.9 Beta</span>
        </div>
        <div className="deck-footer-cols">
          <div className="deck-footer-col">
            <div className="deck-footer-h">QUELLEN</div>
            <div className="deck-footer-list">DWD · GeoSphere Austria<br />MeteoSwiss · Open-Meteo<br />ERA5 · Meteosat</div>
          </div>
          <div className="deck-footer-col">
            <div className="deck-footer-h">WERKZEUGE</div>
            <div className="deck-footer-links">
              <button type="button" onClick={() => onOpenFeature(FEATURE.map2d)}>Wetterkarte</button> ·{' '}
              <button type="button" onClick={() => onOpenFeature(FEATURE.nowcast)}>Nowcast</button><br />
              <button type="button" onClick={() => onOpenFeature(FEATURE.route)}>Touren</button> ·{' '}
              <button type="button" onClick={() => onOpenFeature(FEATURE.event)}>Event</button><br />
              <button type="button" onClick={() => onOpenFeature(FEATURE.history)}>Historie</button> ·{' '}
              <button type="button" onClick={() => onOpenFeature(FEATURE.atmosphere)}>Atmosphäre</button>
            </div>
          </div>
          <div className="deck-footer-col">
            <div className="deck-footer-h">MEHR</div>
            <div className="deck-footer-links">
              <button type="button" onClick={() => onOpenFeature(FEATURE.feedback)}>Feedback</button><br />
              <button type="button" onClick={() => onOpenFeature(FEATURE.validation)}>Validierung</button><br />
              <button type="button" onClick={() => onOpenFeature(FEATURE.globe)}>3D-Globus</button>
            </div>
          </div>
        </div>
      </div>
      <div className="deck-footer-bot">
        <span>MapLibre · © OpenStreetMap-Mitwirkende</span>
        <span>© 2026 buscosun · Kein sicherheitskritisches Briefing</span>
      </div>
    </footer>
  );
}

// ============================================================================
// COMMAND PALETTE — ⌘K-Overlay: Text filtert, Enter/Klick öffnet Feature.
// ============================================================================
function CommandPalette({ open, onClose, onOpenFeature }: {
  open: boolean;
  onClose: () => void;
  onOpenFeature: (f: FeatureInfo) => void;
}) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PALETTE;
    return PALETTE.filter((p) => `${p.label} ${p.hint} ${p.feature.eyebrow}`.toLowerCase().includes(q));
  }, [query]);

  // Beim Öffnen zurücksetzen + Fokus. Auswahl bei Filterwechsel klemmen.
  useEffect(() => {
    if (open) { setQuery(''); setSel(0); const t = window.setTimeout(() => inputRef.current?.focus(), 30); return () => window.clearTimeout(t); }
  }, [open]);
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, filtered.length - 1))); }, [filtered.length]);

  if (!open) return null;

  const commit = (i: number) => {
    const entry = filtered[i];
    if (entry) onOpenFeature(entry.feature);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="deck-pal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="deck-pal-card" role="dialog" aria-modal="true" aria-label="Befehls-Palette">
        <div className="deck-pal-search">
          <span className="deck-pal-icon"><SearchIcon size={18} /></span>
          <input
            ref={inputRef}
            className="deck-pal-input"
            placeholder="Ort suchen oder Werkzeug springen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Werkzeug suchen"
            aria-activedescendant={filtered[sel] ? `pal-${filtered[sel].feature.id}` : undefined}
          />
          <kbd className="deck-kbd">ESC</kbd>
        </div>
        <div className="deck-pal-list" role="listbox" aria-label="Werkzeuge">
          <div className="deck-pal-section">WERKZEUGE</div>
          {filtered.length === 0 && <div className="deck-pal-empty">Kein Werkzeug gefunden — tippe einen Ort in die große Suche oben.</div>}
          {filtered.map((p, i) => (
            <button
              key={p.feature.id}
              id={`pal-${p.feature.id}`}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={`deck-pal-item${i === sel ? ' is-sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => commit(i)}
            >
              <span className="deck-pal-num">{p.num}</span>
              <span className="deck-pal-label">{p.label}</span>
              <span className="deck-pal-hint">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MOBILE BOTTOM-TAB-BAR — Start · Karte · Touren · Suche (nur ≤767px).
// safeArea.css sorgt für Home-Indicator-Abstand.
// ============================================================================
function MobileTabBar({ onOpenFeature, onSearch }: { onOpenFeature: (f: FeatureInfo) => void; onSearch: () => void }) {
  return (
    <nav className="deck-tabbar safe-pad-bottom" aria-label="Schnellzugriff">
      <button type="button" className="deck-tab is-active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Start">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11 L12 3 L21 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 10 V20 H19 V10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        <span>Start</span>
      </button>
      <button type="button" className="deck-tab" onClick={() => onOpenFeature(FEATURE.map2d)} aria-label="Wetterkarte">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6 L9 4 L15 6 L20 4 V18 L15 20 L9 18 L4 20 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 4 V18 M15 6 V20" stroke="currentColor" strokeWidth="1.6" /></svg>
        <span>Karte</span>
      </button>
      <button type="button" className="deck-tab" onClick={() => onOpenFeature(FEATURE.route)} aria-label="Tourenplanung">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 18 L9 9 L13 14 L20 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Touren</span>
      </button>
      <button type="button" className="deck-tab" onClick={onSearch} aria-label="Ort suchen">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.8" /><line x1="15" y1="15" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span>Suche</span>
      </button>
    </nav>
  );
}
