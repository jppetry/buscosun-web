/**
 * Buscosun Startseite v2.0 — radikal vereinfacht.
 *
 * Reduziert auf das Wesentliche: Logo oben, Headline + Suchfeld zentriert,
 * schmaler Footer unten. Keine Live-Demo-Karte, kein Hero-Split — Suche ist
 * der Einstieg. Sand-Ink-Designsprache.
 *
 * Layout
 *   - Nav: Logo + DE/EN
 *   - Center: Eyebrow + Headline + Sub + Inline-Suchfeld + Subline
 *   - Footer: Buscosun · v0.9 Beta · keine Tracker
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Location, NominatimResult } from './types';
import type { FeatureId, FeatureInfo } from './App';
import { parseCountry, DACH_VIEW } from './countryProfiles';
import { warmMapData } from './fusion/loadFusedForecast';
import { flagForCountry } from './geocode';
import { getFavorites, removeFavorite } from './favorites';
import { useIntroTour, type IntroTour } from './intro/useIntroTour';
import IntroOverlay from './intro/IntroOverlay';
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

export default function SearchPage({ onSelect, onOpenFeature }: Props) {
  const tour = useIntroTour();
  useEffect(() => {
    // Volles Warm-up beim Mount der Startseite. Lädt im Hintergrund:
    //   – DEM-Tiles (Terrarium z=5, ~1 MB)
    //   – Primary-Sources: DWD-Obs + MOSMIX in beiden Hour-Slots
    //   – Secondary-Sources: AROME / INCA / TAWES / SMN
    //   – Phase-A-Fusion für DE (Default-Land) via requestIdleCallback
    // Resultat: MapView öffnet bei Klick auf eine DE-Location instant
    // (Result-Cache-Hit), AT/CH profitieren vom warmen Source-Cache.
    warmMapData();
  }, []);

  return (
    <div className="hero-page">
      {/* Sand-Art-SVG als Sofort-/Offline-Fallback, darüber die echte 2D-Karte. */}
      <HeroBackground />
      <HeroMapBackground />
      <HeroNav />

      <main className="hero-center">
        <HeroSearchInline onSelect={onSelect} />
        <HeroFavorites onSelect={onSelect} />
        <IntroTrigger tour={tour} />
      </main>

      <HeroFeatures onOpenFeature={onOpenFeature} />
      <HeroFooter onOpenFeature={onOpenFeature} />
      <IntroOverlay tour={tour} />
    </div>
  );
}

// ============================================================================
// INTRO-TOUR — dezenter Trigger unter dem Hero (Erstbesuch: einmaliger Puls)
// ============================================================================
function IntroTrigger({ tour }: { tour: IntroTour }) {
  return (
    <button
      type="button"
      className={`intro-trigger${tour.pulse ? ' is-pulse' : ''}`}
      onClick={tour.start}
    >
      <span className="intro-trigger-spark" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 1.5 L9.4 6.6 L14.5 8 L9.4 9.4 L8 14.5 L6.6 9.4 L1.5 8 L6.6 6.6 Z" />
        </svg>
      </span>
      Entdecke buscosun
    </button>
  );
}

// ============================================================================
// NAV — nur Logo + Sprachschalter
// ============================================================================
function HeroNav() {
  return (
    <nav className="hero-nav">
      <a className="hero-logo" href="#">
        <Logo />
        <span className="hero-logo-name">buscosun</span>
      </a>
      <div className="hero-nav-right">
        <span className="hero-lang">
          <span>DE</span>
          <span className="sep">·</span>
          <span className="inactive">EN</span>
        </span>
      </div>
    </nav>
  );
}

// ============================================================================
// Gespeicherte Orte (Favoriten) — Ein-Klick zur Karte
// ============================================================================
function HeroFavorites({ onSelect }: { onSelect: (location: Location) => void }) {
  const [favs, setFavs] = useState<Location[]>(() => getFavorites());
  if (favs.length === 0) return null;
  return (
    <div className="hero-favs">
      <span className="hero-favs-label">Gespeichert</span>
      {favs.map((f) => (
        <span key={`${f.lat},${f.lon}`} className="hero-fav-chip">
          <button type="button" className="hero-fav-open" onClick={() => onSelect(f)} title={f.name}>
            <span aria-hidden="true">{flagForCountry(f.country)}</span>
            <span className="hero-fav-name">{f.name.split(',')[0]}</span>
          </button>
          <button type="button" className="hero-fav-x" aria-label={`${f.name} entfernen`}
            onClick={() => setFavs(removeFavorite(f))}>×</button>
        </span>
      ))}
    </div>
  );
}

function Logo() {
  return <img className="hero-logo-mark" src="/buscosun-mark.svg" width="32" height="32" alt="" aria-hidden="true" />;
}

// ============================================================================
// BACKGROUND ART — Wind streamlines
// ============================================================================
function HeroBackground() {
  return (
    <svg className="hero-bg" viewBox="0 0 1440 1100" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs>
        <linearGradient id="wind-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8B7355" stopOpacity="0" />
          <stop offset="50%" stopColor="#8B7355" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8B7355" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g opacity="0.12">
        <path d="M 0 760 Q 200 640 400 670 T 800 650 T 1200 660 T 1440 680 L 1440 1100 L 0 1100 Z" fill="#B8A480" />
        <path d="M 0 820 Q 240 720 480 750 T 960 730 T 1440 760 L 1440 1100 L 0 1100 Z" fill="#A89472" />
        <path d="M 0 880 Q 300 800 600 830 T 1200 810 T 1440 840 L 1440 1100 L 0 1100 Z" fill="#988168" />
      </g>
      <g opacity="0.35">
        <path d="M -50 280 Q 360 270 720 290 T 1490 310" stroke="url(#wind-grad)" strokeWidth="2"   fill="none" />
        <path d="M -50 340 Q 360 330 720 350 T 1490 370" stroke="url(#wind-grad)" strokeWidth="1.5" fill="none" />
        <path d="M -50 220 Q 360 210 720 230 T 1490 250" stroke="url(#wind-grad)" strokeWidth="1"   fill="none" />
        <path d="M -50 400 Q 360 390 720 410 T 1490 430" stroke="url(#wind-grad)" strokeWidth="2"   fill="none" />
        <path d="M -50 460 Q 360 450 720 470 T 1490 490" stroke="url(#wind-grad)" strokeWidth="1"   fill="none" />
        <path d="M -50 520 Q 360 510 720 530 T 1490 550" stroke="url(#wind-grad)" strokeWidth="1.5" fill="none" />
      </g>
    </svg>
  );
}

// ============================================================================
// BACKGROUND MAP — echte 2D-DACH-Karte als Hero-Hintergrund (Experiment).
// Nicht-interaktiv, in die Sand-Palette getönt und mit Sand-Scrim überblendet,
// damit Headline/Suche/Feature-Kacheln lesbar bleiben. Liegt über dem SVG-
// Fallback (HeroBackground), das bei Offline/Tile-Fehler sichtbar bleibt.
// ============================================================================
function HeroMapBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: DACH_VIEW.defaultCenter,
      zoom: 4.7,
      minZoom: 3,
      maxZoom: 7,
      interactive: false,
      attributionControl: false,
    });
    map.on('load', () => setReady(true));
    return () => map.remove();
  }, []);

  return (
    <div className={`hero-map${ready ? ' is-ready' : ''}`} aria-hidden="true">
      <div ref={ref} className="hero-map-canvas" />
      <div className="hero-map-scrim" />
    </div>
  );
}

// ============================================================================
// INLINE-SUCHFELD — direkt im Hero, ohne Modal-Indirektion
// ============================================================================
interface SearchInlineProps {
  onSelect: (loc: Location) => void;
}
function HeroSearchInline({ onSelect }: SearchInlineProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc leert die Suche, Outside-Klick schließt das Dropdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setResults([]); setError(null);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setResults([]);
      }
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
    <div className={`hero-search-wrap${showDropdown ? ' has-dropdown' : ''}`} ref={wrapRef}>
      <form className="hero-search" onSubmit={handleSubmit} role="search">
        <svg className="hero-search-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="8" cy="8" r="6" />
          <line x1="13" y1="13" x2="17" y2="17" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="hero-search-input"
          placeholder="Stadt, Straße oder PLZ …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          aria-label="Standort suchen"
        />
        <button
          type="submit"
          className="hero-search-go"
          disabled={loading || !query.trim()}
        >
          {loading ? 'Suche …' : 'Öffnen'}
          {!loading && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <line x1="1" y1="6" x2="10" y2="6" /><polyline points="6,2 10,6 6,10" />
            </svg>
          )}
        </button>
      </form>

      {showDropdown && (
        <div className="hero-search-dropdown" role="listbox">
          {error && <div className="hero-search-error">⚠ {error}</div>}
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              className="hero-search-result"
              onClick={() => pickResult(r)}
            >
              <span className="country-flag" aria-hidden="true">{flagFor(r.address?.country_code)}</span>
              <span className="result-name">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="hero-search-foot">
        <span className="kbd">↵</span>
        <span>Enter zum Suchen</span>
        <span className="hero-search-foot-sep" />
        <span>Live-Daten aus DE · AT · CH</span>
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

// ============================================================================
// FEATURE TILES — visuelle Vorschau auf kommende Features. Jede Kachel ist
// klickbar und öffnet ihre eigene Feature-Seite.
// ============================================================================
function HeroFeatures({ onOpenFeature }: { onOpenFeature: (feature: FeatureInfo) => void }) {
  return (
    <section className="hero-features" aria-label="Features">
      <FeatureTile
        id="map2d"
        eyebrow="Wetterkarte"
        title="Die ganze DACH-Wetterkarte"
        description="Wind, Niederschlag, Temperatur, Wolken, Satellit & Blitze auf der interaktiven 2D-Karte — ohne Ortssuche, direkt loslegen."
        preview={<MapTilePreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="route"
        eyebrow="Tourenplanung"
        title="Wetter entlang deiner Route"
        description="GPX hochladen oder Strecke planen. Sieh Wind, Regen und Temperatur an jedem Kilometer mit Zeit-Scrubber."
        preview={<RoutePreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="event"
        eyebrow="Event-Planung"
        title="Welcher Tag passt am besten?"
        description="Sag uns wann du wandern, grillen oder fotografieren willst — wir vergleichen die nächsten 7 Tage und nennen den besten."
        preview={<DayScorePreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="history"
        eyebrow="Historie"
        title="Wie hat sich das Wetter bei dir verändert?"
        description="Klimastreifen, Kenntage-Trends und Rekorde aus Jahrzehnten Wetterhistorie — stell eine Frage oder such deinen Ort, kein Fachwissen nötig."
        preview={<HistoryPreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="forecast"
        eyebrow="Vorhersage"
        title="Mehrere Modelle, ehrlicher Spread"
        description="ICON-D2, MOSMIX und ICON-EU im Vergleich. Du siehst nicht nur eine Zahl, sondern wie sicher sie ist."
        preview={<SpreadPreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="nowcast"
        eyebrow="Regenradar"
        title="Regenradar"
        description="Minutengenaues Radar mit ehrlichem Messung↔Vorhersage-Bruch, Punkt-Streifen „Regen in X min“, Sturmzellen-ETA, Schneefallgrenze, Blitzen & Datenqualität — aus DWD-RADOLAN, GeoSphere INCA & MeteoSchweiz."
        preview={<NowcastPreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="atmosphere"
        eyebrow="Atmosphäre"
        title="Die Atmosphäre über dir"
        description="Eine Linse fürs Fliegen, Berg & Weg oder den Himmel: Thermik, Inversion, Wolkenbasis und Höhenwind als Vertikalprofil — mit ehrlicher Einschätzung über die nächsten 48 Stunden."
        preview={<AtmospherePreview />}
        flush
        onOpen={onOpenFeature}
      />
      <FeatureTile
        id="globe"
        eyebrow="3D-Globus"
        title="Das Wetter der ganzen Erde"
        description="Eine frei drehbare 3D-Erdkugel mit globalem Wind und Wetter — vom Jetstream bis zum Tiefdruckwirbel, in einem Bild."
        preview={<GlobePreview />}
        flush
        onOpen={onOpenFeature}
      />
    </section>
  );
}

interface FeatureTileProps {
  id: FeatureId;
  eyebrow: string;
  title: string;
  description: string;
  preview: ReactNode;
  /** When set, the tile becomes an interactive button that opens its feature page. */
  onOpen?: (feature: FeatureInfo) => void;
  /** Vorschau füllt die Box randlos (ohne Padding/Hintergrund) — z. B. Wetterkarte. */
  flush?: boolean;
}
function FeatureTile({ id, eyebrow, title, description, preview, onOpen, flush }: FeatureTileProps) {
  const live = !!onOpen;
  const open = () => onOpen?.({ id, eyebrow, title });
  const inner = (
    <>
      <div className={`feature-preview${flush ? ' feature-preview-flush' : ''}`}>{preview}</div>
      <div className="feature-text">
        <span className="feature-eyebrow">{eyebrow}{live && <span className="feature-live-dot" aria-label="verfügbar" />}</span>
        <h3 className="feature-title">{title}</h3>
        <p className="feature-desc">{description}</p>
        <span className="feature-arrow" aria-hidden="true">
          <svg width="20" height="14" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="1" y1="7" x2="17" y2="7" />
            <polyline points="12,2 17,7 12,12" />
          </svg>
        </span>
      </div>
    </>
  );
  // Live = echtes <button> (native Tastatur/Fokus/ARIA, korrekte a11y-Rolle);
  // inert = neutrales <div>. Kein role="button" auf <article> mehr.
  return live ? (
    <button type="button" className="feature-tile feature-tile-live" onClick={open}>{inner}</button>
  ) : (
    <div className="feature-tile">{inner}</div>
  );
}

/* ----- Preview 0: 2D-WETTERKARTE — gespiegelt aus der Intro-Illustration
   „Wetterkarte" (intro/introArt.tsx · MapArt): gerahmte Sandkarte mit
   Höhenlinien, Pin und Layer-Chips, Akzent steel-600. Line-Art-Designsprache
   statt des früheren bunten Verlauf-/Wind-/Punkte-Mix. ----- */
function MapTilePreview() {
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--steel-600)' }}>
      {/* Kartenfläche — füllt die Vorschau, dezenter Abstand kommt aus dem Padding */}
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Höhenlinien (Akzent) */}
      <g stroke="currentColor" opacity="0.45">
        <path d="M 28 52 Q 92 40 150 52 T 232 46" />
        <path d="M 28 78 Q 92 66 150 78 T 232 72" />
        <path d="M 28 102 Q 92 90 150 102 T 232 96" />
      </g>
      {/* Ort-Pin (Akzent) */}
      <g>
        <path d="M 130 100 C 121 86 117 79 117 71 a 13 13 0 1 1 26 0 c 0 8 -4 15 -13 29 Z" fill="currentColor" stroke="none" />
        <circle cx="130" cy="71" r="5" fill="var(--sand-100)" stroke="none" />
      </g>
      {/* Layer-Chips: zwei neutral, einer aktiv (Akzent) */}
      <g strokeWidth="1.5">
        <rect x="55" y="108" width="42" height="14" rx="7" fill="#fff" stroke="var(--sand-200)" />
        <rect x="105" y="108" width="50" height="14" rx="7" fill="currentColor" stroke="none" />
        <rect x="163" y="108" width="42" height="14" rx="7" fill="#fff" stroke="var(--sand-200)" />
      </g>
    </svg>
  );
}

/* ----- Preview 1: TOURENPLANUNG — gespiegelt aus der Intro-Illustration
   „Tourenplanung" (intro/introArt.tsx · RouteArt): Höhenprofil mit Start/Ziel,
   Sonne und Wolke, Akzent sage-600. Gleiche randlose Sandfläche + Größe wie
   die Wetterkarte. ----- */
function RoutePreview() {
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--sage-600)' }}>
      {/* Sandfläche */}
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Höhenprofil-Fläche — Basislinie über der Kachelkante, damit der untere
          Sand-Rand (runde Ecke) sichtbar bleibt wie bei den anderen Icons */}
      <path d="M 26 116 Q 86 44 132 48 T 238 100 L 238 122 L 26 122 Z" fill="var(--sand-200)" stroke="none" />
      {/* Profil-Kurve (Akzent) */}
      <path d="M 26 116 Q 86 44 132 48 T 238 100" stroke="currentColor" />
      {/* Start (ink) + Ziel (Akzent) */}
      <circle cx="26" cy="116" r="5" fill="var(--ink-900)" stroke="none" />
      <circle cx="238" cy="100" r="5" fill="currentColor" stroke="none" />
      {/* Sonne über dem Aufstieg */}
      <g transform="translate(74 44)" stroke="currentColor">
        <circle r="8" fill="#fff" />
        <g strokeWidth="2">
          <line x1="0" y1="-14" x2="0" y2="-11" /><line x1="0" y1="11" x2="0" y2="14" />
          <line x1="-14" y1="0" x2="-11" y2="0" /><line x1="11" y1="0" x2="14" y2="0" />
          <line x1="-10" y1="-10" x2="-7.7" y2="-7.7" /><line x1="7.7" y1="7.7" x2="10" y2="10" />
          <line x1="-10" y1="10" x2="-7.7" y2="7.7" /><line x1="7.7" y1="-7.7" x2="10" y2="-10" />
        </g>
      </g>
      {/* Wolke beim Abstieg */}
      <g transform="translate(196 56)">
        <path d="M -18 6 C -25 6 -26 -3 -19 -6 C -19 -14 -7 -17 -1 -11 C 4 -17 17 -14 17 -3 C 25 -3 25 6 17 6 Z"
          fill="#fff" stroke="var(--stone-400)" />
      </g>
    </svg>
  );
}

/* ----- Historie — Klimastreifen als Akzent-Opazitätsverlauf (kühl→warm) mit
   Erwärmungs-Trendlinie, Akzent terracotta-500. Line-Art-Spec + randlose
   Sandfläche/Größe wie die Wetterkarte. ----- */
function HistoryPreview() {
  const N = 16;
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--terracotta-500)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Klimastreifen: kühl → warm über die Akzent-Opazität */}
      <g stroke="none">
        {Array.from({ length: N }, (_, i) => (
          <rect key={i} x={26 + i * 13} y="34" width="11.5" height="72" rx="1.5"
            fill="currentColor" opacity={0.18 + (i / (N - 1)) * 0.72} />
        ))}
      </g>
      {/* Erwärmungs-Trendlinie + Endpunkt */}
      <path d="M 30 98 Q 132 90 230 58" stroke="var(--ink-900)" />
      <circle cx="230" cy="58" r="4.5" fill="var(--ink-900)" stroke="none" />
    </svg>
  );
}

/* ----- Preview 2: EVENT-PLANUNG — gespiegelt aus der Intro-Illustration
   „Event-Planung" (intro/introArt.tsx · EventArt): Score-Donut + 7-Tage-Balken
   mit markiertem besten Tag, Akzent amber-500. Gleiche randlose Sandfläche +
   Größe wie die Wetterkarte. ----- */
function DayScorePreview() {
  const C = 2 * Math.PI * 24;
  const filled = C * 0.78;
  const bars = [22, 30, 36, 50, 40, 26, 22];
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--amber-500)' }}>
      {/* Sandfläche */}
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Score-Donut (78 %) */}
      <g transform="translate(60 70)">
        <circle r="24" stroke="var(--sand-200)" strokeWidth="7" />
        <circle r="24" stroke="currentColor" strokeWidth="7" strokeDasharray={`${filled} ${C}`} transform="rotate(-90)" />
        <circle r="3.5" cx="0" cy="-24" fill="currentColor" stroke="none" transform="rotate(-90)" />
      </g>
      {/* 7-Tage-Balken, bester Tag markiert */}
      <g transform="translate(112 42)" strokeWidth="1.5">
        {bars.map((h, i) => {
          const best = i === 3;
          return (
            <g key={i} transform={`translate(${i * 20} ${56 - h})`}>
              <rect width="14" height={h} rx="3.5" fill={best ? 'currentColor' : '#fff'} stroke={best ? 'none' : 'var(--sand-200)'} />
              {best && <path d="M 4 7 L 7 10 L 11 4" stroke="#fff" strokeWidth="2" fill="none" />}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* ----- Vorhersage — gespiegelt aus Intro „Vorhersage" (introArt.tsx · ForecastArt):
   Mehrmodell-Spread-Fächer mit Unsicherheitsband + Caliper, Akzent steel-600.
   Randlose Sandfläche/Größe wie die Wetterkarte. ----- */
function SpreadPreview() {
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--steel-600)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Basislinie */}
      <line x1="30" y1="116" x2="232" y2="116" stroke="var(--sand-300)" strokeDasharray="3 5" />
      {/* Spread-Band */}
      <path d="M 40 84 L 220 44 L 220 108 Z" fill="currentColor" fillOpacity="0.12" stroke="none" />
      {/* Modell-Linien (Fächer) + Mittelwert */}
      <path d="M 40 84 L 220 44" stroke="currentColor" opacity="0.55" />
      <path d="M 40 84 L 220 108" stroke="currentColor" opacity="0.55" />
      <path d="M 40 84 L 220 78" stroke="var(--ink-900)" />
      <circle cx="40" cy="84" r="5" fill="var(--ink-900)" stroke="none" />
      {/* Caliper (Spannweite) */}
      <g stroke="var(--ink-900)" strokeWidth="1.6">
        <line x1="232" y1="44" x2="232" y2="108" />
        <line x1="227" y1="44" x2="237" y2="44" />
        <line x1="227" y1="108" x2="237" y2="108" />
      </g>
    </svg>
  );
}

/* ----- Regenradar — gespiegelt aus Intro „Regenradar" (introArt.tsx · RadarArt):
   Reichweiten-Ringe, Sweep-Keil und Regenwolke, Akzent slate-500. Randlose
   Sandfläche/Größe wie die Wetterkarte. ----- */
function NowcastPreview() {
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--slate-500)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Reichweiten-Ringe */}
      <g stroke="var(--sand-300)">
        <circle cx="104" cy="78" r="48" />
        <circle cx="104" cy="78" r="32" />
        <circle cx="104" cy="78" r="16" />
      </g>
      {/* Sweep-Keil + Strahl (Akzent) */}
      <path d="M 104 78 L 104 30 A 48 48 0 0 1 146 56 Z" fill="currentColor" opacity="0.16" stroke="none" />
      <line x1="104" y1="78" x2="146" y2="56" stroke="currentColor" />
      <circle cx="104" cy="78" r="4" fill="currentColor" stroke="none" />
      {/* Regenwolke oben rechts */}
      <g transform="translate(198 48)">
        <path d="M -20 7 C -28 7 -29 -2 -22 -5 C -22 -14 -9 -18 -3 -12 C 3 -18 16 -14 16 -3 C 25 -3 25 7 16 7 Z" fill="#fff" stroke="currentColor" />
        <g stroke="currentColor" strokeWidth="2">
          <line x1="-10" y1="12" x2="-13" y2="20" />
          <line x1="0" y1="12" x2="-3" y2="20" />
          <line x1="10" y1="12" x2="7" y2="20" />
        </g>
      </g>
    </svg>
  );
}

/* ----- Atmosphäre — Vertikalprofil-Säule mit Schicht-Bändern (Grenzschicht →
   Wolkenbasis → Höhenwind) + Sonne, Akzent steel-600. Line-Art-Spec + randlose
   Sandfläche/Größe wie die Wetterkarte. ----- */
function AtmospherePreview() {
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--steel-600)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Sonne oben rechts */}
      <g transform="translate(214 34)" stroke="currentColor">
        <circle r="9" fill="#fff" />
        <g strokeWidth="2">
          <line x1="0" y1="-15" x2="0" y2="-12" /><line x1="0" y1="12" x2="0" y2="15" />
          <line x1="-15" y1="0" x2="-12" y2="0" /><line x1="12" y1="0" x2="15" y2="0" />
          <line x1="-11" y1="-11" x2="-8.5" y2="-8.5" /><line x1="8.5" y1="8.5" x2="11" y2="11" />
        </g>
      </g>
      {/* Höhen-Bänder (transluzent, von oben kühl → unten warm) */}
      <g stroke="none">
        <rect x="26" y="30" width="150" height="22" rx="3" fill="currentColor" opacity="0.10" />
        <rect x="26" y="56" width="150" height="22" rx="3" fill="currentColor" opacity="0.16" />
        <rect x="26" y="82" width="150" height="22" rx="3" fill="var(--sage-600)" opacity="0.22" />
      </g>
      {/* Geländeboden */}
      <path d="M 26 116 Q 70 102 110 110 T 200 106 L 200 116 Z" fill="var(--sand-300)" stroke="none" />
      {/* Vertikale Sampling-Säule + Knoten je Schicht */}
      <line x1="101" y1="26" x2="101" y2="116" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 3" opacity="0.85" />
      <g fill="currentColor" stroke="none">
        <circle cx="101" cy="41" r="3" />
        <circle cx="101" cy="67" r="3" />
        <circle cx="101" cy="93" r="3" />
      </g>
      {/* Höhenwind-Barbs rechts der Säule */}
      <g stroke="currentColor" strokeWidth="1.6">
        <line x1="120" y1="41" x2="140" y2="41" /><line x1="140" y1="41" x2="135" y2="37" />
        <line x1="120" y1="67" x2="136" y2="67" /><line x1="136" y1="67" x2="132" y2="64" />
        <line x1="120" y1="93" x2="132" y2="93" />
      </g>
    </svg>
  );
}

/* ----- 3D-Globus — gespiegelt aus Intro „3D-Globus" (introArt.tsx · GlobeArt):
   Kugel mit Gitter, Atmosphäre und Jetstream-Bändern, Akzent slate-500. Randlose
   Sandfläche/Größe wie die Wetterkarte. ----- */
function GlobePreview() {
  const cx = 130, cy = 70, r = 48;
  return (
    <svg viewBox="0 0 260 140" fill="none" aria-hidden="true" className="feature-svg"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--slate-500)' }}>
      <rect x="0" y="0" width="260" height="140" rx="12" fill="var(--sand-100)" />
      {/* Atmosphäre */}
      <circle cx={cx} cy={cy} r={r + 6} stroke="currentColor" strokeWidth="6" opacity="0.22" />
      {/* Kugel */}
      <circle cx={cx} cy={cy} r={r} fill="var(--sand-200)" stroke="var(--sand-300)" />
      {/* Gitter */}
      <g stroke="var(--stone-400)" strokeWidth="1.2" opacity="0.6" fill="none">
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} />
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} />
        <ellipse cx={cx} cy={cy} rx={r * 0.4} ry={r} />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.42} />
      </g>
      {/* Jetstream-Bänder (Akzent) */}
      <g fill="none">
        <path d="M 92 56 Q 130 46 172 58" stroke="currentColor" />
        <path d="M 90 90 Q 130 100 174 88" stroke="currentColor" opacity="0.55" />
      </g>
      {/* Glanzlicht */}
      <ellipse cx={cx - 16} cy={cy - 16} rx="12" ry="8" fill="#fff" opacity="0.4" stroke="none" />
    </svg>
  );
}

// ============================================================================
// FOOTER — slim
// ============================================================================
function HeroFooter({ onOpenFeature }: { onOpenFeature: (feature: FeatureInfo) => void }) {
  return (
    <footer className="hero-footer">
      <div className="hero-footer-slim">
        <span className="hero-footer-logo">
          <Logo />
          buscosun
        </span>
        <span className="hero-footer-version">v0.9 Beta</span>
        <button
          type="button"
          className="hero-footer-link"
          onClick={() => onOpenFeature({ id: 'validation', eyebrow: 'Validierung', title: 'Wie gut ist der KI-Nowcast wirklich?' })}
        >
          Validierung
        </button>
        <span className="hero-footer-bot">
          © 2026 buscosun · keine Tracker · keine Werbung
        </span>
      </div>
    </footer>
  );
}
