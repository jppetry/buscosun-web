/**
 * Buscosun Startseite v3.0 — „Kommando-Deck".
 *
 * Redesign nach design_handoff_startseite (references/desktop|tablet|mobile.dc.html):
 * eine Kommandozentrale statt Landingpage. Aufbau von oben nach unten:
 *   - Command-Bar: Logo · ⌘K-Trigger · „DATEN LIVE" · DE/EN
 *   - Hero: Eyebrow · Wortmarke · Sub · große Ortssuche (+ Direkt-Link Wetterkarte)
 *   - Filter-Chips: Alle / Karten & Radar / Planen / Verstehen / Erkunden
 *   - Bento-Grid: 10 Werkzeug-Kacheln (Desktop 4-Spalten, Tablet 3, Mobile 1–2)
 *     — seit Phase WB1 schließt „10 · Waldbrand" als volle Breite die Liste ab
 *   - Fundament (Fusion Forecast) · „Ehrlich bleiben" · Footer
 *   - ⌘K-Command-Palette (Overlay) · Mobile-Bottom-Tab-Bar
 *
 * ALLE bestehenden Verdrahtungen bleiben erhalten und werden weitergenutzt:
 *   onSelect (Geocode-Flow), onOpenFeature (jede Kachel + Palette-Eintrag),
 *   warmMapData()-Warm-up, Favoriten, Intro-Tour; Hintergrund = DACH-Karte (SVG).
 * Kein Tile/Palette-Eintrag zeigt ins Leere — jede Ziel-ID existiert in
 * App.tsx (FeatureId). Das Mock-Tile „KI-Meteorologe" hat kein reales Feature;
 * an seiner Stelle steht die bestehende Feedback-Kachel (Entscheidung Jan).
 */

import {
  lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type FormEvent, type ReactNode,
} from 'react';
import type { Location, NominatimResult } from './types';
import type { FeatureInfo } from './App';
import { pathForFeature } from './router/routes';
import { parseCountry } from './countryProfiles';
import RadarSweepIcon from './RadarSweepIcon';
import GlobeIcon from './GlobeIcon';
import FireIcon from './FireIcon';
import GlacierIcon from './GlacierIcon';
import SeaIcon from './SeaIcon';
import RoadIcon from './RoadIcon';
import RouteHikerIcon from './RouteHikerIcon';
import { DachMapPreview } from './DachMapPreview';
// DACH-Karte im Hintergrund lazy: hält den Startseiten-Bundle schlank (eigener Chunk).
const DachMapBackground = lazy(() => import('./DachMapBackground'));
// Mobil + kleine Tablets (≤1024 px): die vier Werkzeug-Kacheln stehen wieder
// im Bento-Grid statt als Quadrat neben der Suche (Jan, 2026-08-09).
const NARROW_QUERY = '(max-width: 1024px)';
/** Mobil (≤ 767 px, Projekt-Breakpoint): dieselben kompakten Kacheln wie am Desktop, im 2-Spalten-Raster. */
const MOBILE_QUERY = '(max-width: 767px)';
import { warmMapData } from './fusion/loadFusedForecast';
import { flagForCountry, suggestDACH } from './geocode';
import { getFavorites, removeFavorite, subscribeFavorites } from './favorites';
import FavoriteStar from './FavoriteStar';
import { useIntroTour, type IntroTour } from './intro/useIntroTour';
import IntroOverlay from './intro/IntroOverlay';
import './mobile/safeArea.css';
import './SearchPage.css';
import { useMediaQuery } from './mobile/useIsMobile';
// Phase AW: Autobahnwetter-Kachel, Palette und Fußlink nur mit `?road=1` bis Gate C (`ROAD_LIVE`).
import { roadFlagFrom, rememberRoadFlag } from './road/roadFlag';
// Phase SW: Seewetter-Kachel, Palette und Fußlink — seit 10.10.2026 für alle (`SEA_LIVE`), `?sea=0` blendet aus.
import { seaFlagFrom, rememberSeaFlag } from './sea/seaFlag';
// Phase GL: Gletscher-Kachel und Palette — nur mit `?gl=1`, bis Jan `GLACIER_LIVE` schaltet (nach Gate D).
import { glacierFlagFrom, rememberGlacierFlag } from './glacier/glacierFlag';
// Phase FX-UI (audit/fusion-erklaerung.md): the preview replaces the block "Fundament" while the flag is on; lazy, so the start bundle only carries the flag reader.
import { fxFlagFrom, rememberFxFlag } from './fusionExplainer/fxFlag';
const FundamentPreview = lazy(() => import('./fusionExplainer/FundamentPreview'));

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
  nowcast:    { id: 'nowcast',    eyebrow: 'Regenradar',    title: 'Regnet es in 40 Minuten?' },
  history:    { id: 'history',    eyebrow: 'Historie',      title: 'Klima seit 1940' },
  atmosphere: { id: 'atmosphere', eyebrow: 'Atmosphäre',    title: 'Die Atmosphäre über dir' },
  globe:      { id: 'globe',      eyebrow: '3D-Globus',     title: 'Das Wetter der ganzen Erde' },
  fire:       { id: 'fire',       eyebrow: 'Waldbrand',     title: 'Wo brennt es gerade?' },
  road:       { id: 'road',       eyebrow: 'Autobahnwetter', title: 'Ist die Strecke glatt?' },
  sea:        { id: 'sea',        eyebrow: 'Seewetter',     title: 'Wie wird es auf dem Wasser?' },
  glacier:    { id: 'glacier',    eyebrow: 'Gletscher',     title: 'Wie geht es dem Eis?' },
  fusion:     { id: 'fusion',     eyebrow: 'Methodik',      title: 'Was zwischen Wettermodell und Vorhersage passiert' },
  feedback:   { id: 'feedback',   eyebrow: 'Feedback',      title: 'Ideen & Vorschläge' },
  validation: { id: 'validation', eyebrow: 'Validierung',   title: 'Wie gut ist der KI-Nowcast wirklich?' },
};

/**
 * Anzahl der Werkzeug-Kacheln (7 im Bento + 2 im HeroQuad + Waldbrand seit WB1).
 *
 * Stand bis Phase WB1 als „09 WERKZEUGE" hartcodiert im Chip-Kopf und wäre bei
 * der zehnten Kachel still falsch geworden. Eine Konstante an einer Stelle ist
 * die kleinste Fassung, die nicht wieder auseinanderläuft — die Kacheln selbst
 * stehen als handgelegtes Raster im JSX und lassen sich nicht zählen.
 */
/** Vorhersage (Konfidenz & Modelle) und Event-Planung sind gelöscht (Jan, 2026-11-11). */
const TOOL_TILE_COUNT = 12;
/** Autobahnwetter- und Seewetter-Kachel zählen, solange ihr Flag an ist (`ROAD_LIVE`/`SEA_LIVE`; `?road=0`, `?sea=0` blenden aus). */
const toolTileCount = () => TOOL_TILE_COUNT - (roadFlagFrom() ? 0 : 1) - (seaFlagFrom() ? 0 : 1) - (glacierFlagFrom() ? 0 : 1);

interface PaletteEntry { num: string; label: string; hint: string; feature: FeatureInfo; }
const PALETTE: PaletteEntry[] = [
  { num: '01', label: 'Wetterkarte',            hint: 'Wind · Regen · Blitze',      feature: FEATURE.map2d },
  { num: '02', label: 'Tourenplanung',          hint: 'Wetter pro km · E-Bike',     feature: FEATURE.route },
  { num: '03', label: 'Regenradar / Nowcast',   hint: 'Gemessenes Radar',           feature: FEATURE.nowcast },
  { num: '04', label: 'Historie',               hint: 'Klima seit 1940',            feature: FEATURE.history },
  { num: '05', label: 'Atmosphäre',             hint: 'Höhenwind · Schnitt',        feature: FEATURE.atmosphere },
  { num: '06', label: '3D-Globus',              hint: 'Live-Wind (GFS)',            feature: FEATURE.globe },
  { num: '07', label: 'Brandradar',            hint: 'Satellit · Brände · Rückblick', feature: FEATURE.fire },
  { num: '08', label: 'Feedback',               hint: 'Ideen & Vorschläge',         feature: FEATURE.feedback },
  { num: '09', label: 'Validierung',            hint: 'Wie gut ist der Nowcast?',   feature: FEATURE.validation },
  { num: '10', label: 'Autobahn Monitor',        hint: 'Glätte · Fahrbahn · DWD',    feature: FEATURE.road },
  { num: '11', label: 'Seewetter',              hint: 'Küste · Segeln · Kiten · Wellen', feature: FEATURE.sea },
  { num: '12', label: 'Gletscherbericht',      hint: 'Schmelze · Schneegrenze · Messreihen', feature: FEATURE.glacier },
];

// ============================================================================
// ROOT
// ============================================================================
export default function SearchPage({ onSelect, onOpenFeature }: Props) {
  const tour = useIntroTour();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => { rememberRoadFlag(); rememberSeaFlag(); rememberGlacierFlag(); rememberFxFlag(); }, []);
  const [activeCat, setActiveCat] = useState<'alle' | Category>('alle');
  const narrow = useMediaQuery(NARROW_QUERY);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Volles Warm-up beim Mount der Startseite (DEM-Tiles, Primary/Secondary-
    // Sources, Phase-A-Fusion für DE). MapView öffnet dann bei DE-Klick instant.
    warmMapData();
  }, []);

  // Den schweren MapView-Chunk im Leerlauf vorwärmen, während der Nutzer sucht. E-DB-20: wer einen Ort wählt, bekommt
  // zuerst das Dashboard — ein noch ausstehendes Vorwärmen fällt dann weg. Die Startseite bleibt bis zum Routenwechsel
  // montiert; ohne das Abbrechen fiele der Leerlauf mitten in den Ladeweg des Dashboards (audit/dashboard.md §12.5).
  const cancelMapWarm = useRef<(() => void) | null>(null);
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
    const id = ric(() => { cancelMapWarm.current = null; void import('./MapView'); });
    cancelMapWarm.current = () => cancel(id);
    return () => { cancel(id); cancelMapWarm.current = null; };
  }, []);
  const selectPlace = useCallback((loc: Location) => {
    cancelMapWarm.current?.();
    cancelMapWarm.current = null;
    onSelect(loc);
  }, [onSelect]);

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

  return (
    <div className="deck">
      {/* DACH-Karte als SVG unter dem Inhalt, läuft mit der Seite. */}
      <Suspense fallback={null}>
        <DachMapBackground />
      </Suspense>

      <main className="deck-main">
        <Hero onSelect={selectPlace} onOpenFeature={openFeature} inputRef={searchInputRef} tour={tour} activeCat={activeCat} onCatChange={setActiveCat} narrow={narrow} />
        <BentoGrid activeCat={activeCat} onOpenFeature={openFeature} narrow={narrow} />
        {fxFlagFrom()
          ? (
            <Suspense fallback={<section className="deck-fundament" aria-label="Fundament"><div className="deck-fundament-inner" style={{ minHeight: 360 }} /></section>}>
              <FundamentPreview onOpen={() => openFeature(FEATURE.fusion)} />
            </Suspense>
          )
          : <Fundament />}
      </main>

      <DeckFooter onOpenFeature={openFeature} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenFeature={openFeature}
      />

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

/* Die Command-Bar (Topbar) wurde am 2026-08-09 auf Jans Wunsch entfernt;
   die Marke steht jetzt oben links im Hero, ⌘K öffnet weiterhin die Palette. */


// ============================================================================
// HERO — Eyebrow · Wortmarke · Sub · große Ortssuche · Favoriten · Intro-Tour
// ============================================================================
interface HeroProps {
  onSelect: (loc: Location) => void;
  onOpenFeature: (f: FeatureInfo) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  tour: IntroTour;
  activeCat: 'alle' | Category;
  onCatChange: (c: 'alle' | Category) => void;
  /** ≤1024 px: das Kachel-Quadrat entfällt hier und steht wieder im Bento-Grid. */
  narrow: boolean;
}
function Hero({ onSelect, onOpenFeature, inputRef, tour, activeCat, onCatChange, narrow }: HeroProps) {
  return (
    <section className="deck-hero" id="top">
      {/* Auftrag Jan 2026-08-09: Eyebrow „LIVE · DE · AT · CH · OHNE ACCOUNT"
          entfernt. Die Aussage steht ohnehin doppelt — „DATEN LIVE" in der
          Command-Bar und „DE · AT · CH" im Untertitel/Kachelwerk. */}
      {/* Marke neben dem Schriftzug — ersetzt die frühere Topbar (Jan, 2026-08-09).
          Die Befehls-Palette bleibt über ⌘K / Strg-K erreichbar. */}
      <div className="deck-titlerow">
        <LogoMark size={84} />
        <h1 className="deck-h1">buscosun</h1>
      </div>

      <HeroSearch onSelect={onSelect} inputRef={inputRef} />
      <FilterChips active={activeCat} onChange={onCatChange} />
      {!narrow && <HeroQuad activeCat={activeCat} onOpenFeature={onOpenFeature} />}
      <HeroFavorites onSelect={onSelect} />
      <IntroTrigger tour={tour} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hero-Paar — die beiden Werkzeug-Kacheln 04/05 neben der Ortssuche.
// Gleiche Kachel-Bausteine wie im Bento-Grid; die Filter-Chips dimmen sie mit.
//
// Ursprünglich standen hier 04–07 als 2×2-Quadrat. 06 (Historie) und 07
// (3D-Wetter) sind auf Jans Auftrag vom 2026-08-09 wieder ins Bento-Grid
// gewandert: das Hero-Feld wird dadurch halb so hoch, und Wetterkarte (01) und
// Tourenplanung (02) rücken entsprechend nach oben. Klassenname `deck-quad`
// bleibt (Layout-Anker in SearchPage.css), die Zeilenzahl steuert das CSS.
// ---------------------------------------------------------------------------
function HeroQuad({ activeCat, onOpenFeature }: { activeCat: 'alle' | Category; onOpenFeature: (f: FeatureInfo) => void }) {
  const tile = makeTile(activeCat, onOpenFeature);
  return (
    <div className="deck-quad" aria-label="Werkzeuge · Waldbrand, Nowcast, Gletscher">
      {tile(['erkunden'], 'tile-fire q-tile', FEATURE.fire, 'Brandradar öffnen', TILE_FIRE)}
      {tile(['radar'], 'tile-nowcast q-tile', FEATURE.nowcast, 'Regenradar / Nowcast öffnen', TILE_NOWCAST)}
      {glacierFlagFrom() && tile(['planen'], 'tile-glacier q-tile', FEATURE.glacier, 'Gletscherbericht öffnen', TILE_GLACIER)}
    </div>
  );
}

// Kachel-Fabrik: identisches Markup/Dim-Verhalten für Hero-Quadrat und Bento.
function makeTile(activeCat: 'alle' | Category, onOpenFeature: (f: FeatureInfo) => void) {
  const dim = (cats: Category[]) => activeCat !== 'alle' && !cats.includes(activeCat);
  return (cats: Category[], cls: string, feature: FeatureInfo, ariaLabel: string, children: ReactNode, style?: CSSProperties) => (
    // A real link (audit/seo-nischen.md): crawlers and "open in new tab" get the feature's path; a plain click stays the app's own navigation.
    <a
      href={pathForFeature(feature.id)}
      className={`deck-tile ${cls}${dim(cats) ? ' is-dim' : ''}`}
      style={style}
      aria-label={ariaLabel}
      aria-hidden={dim(cats) || undefined}
      tabIndex={dim(cats) ? -1 : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpenFeature(feature);
      }}
    >
      {children}
    </a>
  );
}

// Kachel-Inhalte, die zwischen Hero (04/05) und Bento (06/07) wandern —
// unverändert gegenüber dem ursprünglichen Bento-Grid.
const TILE_NOWCAST = (
  <>
    <div className="tile-eyebrow">NOWCAST</div>
    {/* Radar-Glyphe mit Nachleuchten, Echos und Zeiger-Folgen
        (audit/startseite-radar-icon.md). */}
    <div className="tile-radar">
      <RadarSweepIcon />
    </div>
    <div>
      <div className="tile-title tile-title-sm">Regnet es in 40 Min?</div>
      {/* D-14: radar-only. Die Modellhälfte 2–12 h wurde mit N1 entfernt —
          der Text versprach sie weiterhin. */}
      {/* Jan 2026-11-13: text follows what /regenradar shows today (5-min frames with look-back and +2 h in all three
          countries, rain start at the place, lightning, storm cells with arrival window). */}
      <p className="tile-desc sm">Radar im 5-Minuten-Takt, 2 h zurück und 2 h voraus. Mit Regenbeginn am Ort, Blitzen und Gewitterzellen.</p>
    </div>
  </>
);

// 10 · Waldbrand — kompakte Kachel wie 04/05 (Hero links neben dem Regenradar). Die Kernaussage
// samt Ehrlichkeitshinweis bleibt; die früheren Langtexte des Bandes sind hier gekürzt.
const TILE_FIRE = (
  <>
    <div className="tile-eyebrow">WALDBRAND</div>
    <div className="tile-flame">
      <FireIcon />
    </div>
    <div>
      <div className="tile-title tile-title-sm">Brandradar</div>
      <p className="tile-desc sm">
        Aktive Brände und Brandflächen per Satellit, aktuell und im Rückblick.
      </p>
    </div>
  </>
);

// 12 · Seewetter — Desktop-Kachel wie Waldbrand und Gletscher (Jan 23.10.2026): animierte Küste mit Wellen, Leuchtturm
// und Boot; Kernaussage samt Ehrlichkeitshinweis. Auf ≤1024 px bleibt die Vollbreiten-Kachel mit Seekarte (SW_TILE_STYLE).
const TILE_SEA = (
  <>
    <div className="tile-eyebrow">SEEWETTER</div>
    <div className="tile-coast-art">
      <SeaIcon />
    </div>
    <div>
      <div className="tile-title tile-title-sm">Seewetter</div>
      <p className="tile-desc sm">
        Seegang, Wind und Böen an rund 60 Spots an Nord- und Ostsee.
      </p>
    </div>
  </>
);

// 13 · Gletscher — Desktop-Kachel wie Waldbrand (Jan 23.10.2026): animierter Gletscher statt Flamme, Kernaussage
// samt Ehrlichkeitshinweis. Auf ≤1024 px bleibt die Vollbreiten-Kachel mit Vorschaukarte (GL_TILE_STYLE).
const TILE_GLACIER = (
  <>
    <div className="tile-eyebrow">GLETSCHER</div>
    <div className="tile-glacier-art">
      <GlacierIcon />
    </div>
    <div>
      <div className="tile-title tile-title-sm">Gletscherbericht</div>
      <p className="tile-desc sm">
        Rund 2 200 Gletscher in DACH: Messreihen, Umrisse und Herkunft je Wert.
      </p>
    </div>
  </>
);

// 11 · Autobahnwetter — kompakte Kachel wie 04/05/10 (Hero, rechts neben der Vorhersage; Jan 17.10.2026). Auf
// ≤1024 px bleibt die Vollbreiten-Kachel am Ende des Bento-Rasters (AW_TILE_STYLE).
const TILE_ROAD = (
  <>
    <div className="tile-eyebrow">AUTOBAHNWETTER</div>
    <div className="tile-road-icon">
      <RoadIcon />
    </div>
    <div>
      <div className="tile-title tile-title-sm">Autobahn Monitor</div>
      <p className="tile-desc sm">
        Fahrbahn von rund 1.200 DWD-Glättemeldeanlagen, alle 15 Minuten, je Autobahn als Streckenband.
      </p>
    </div>
  </>
);

const TILE_HISTORY = (
  <>
    <div className="tile-eyebrow">HISTORIE</div>
    <div className="tile-stripes" aria-hidden="true">
      {['#08306B', '#2171B5', '#6BAED6', '#C6DBEF', '#9ECAE1', '#2171B5', '#FCBBA1', '#FB6A4A', '#EF3B2C', '#CB181D', '#A50F15', '#67000D'].map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </div>
    <div>
      <div className="tile-title tile-title-sm">Klima seit 1940</div>
      <p className="tile-desc sm">ERA5: Warming-Stripes, Anomalien, Kenntage, Rekorde, Trends, Windrose.</p>
    </div>
  </>
);

const TILE_THREED = (
  <>
    <div className="tile-head">
      <div className="tile-eyebrow">3D-WETTER</div>
      <span className="tile-badge badge-solid">Höhenwind</span>
    </div>
    <svg viewBox="0 0 220 70" preserveAspectRatio="none" className="tile-terrain-svg" aria-hidden="true">
      {/* Vertikalschnitt: Anströmung über den Kamm, Wolkenkappe luvseitig, Föhn warm im Lee.
          Die Bewegung ist reines CSS (.tile-vs-*); kein Messwert, nur Sinnbild. */}
      <path className="tile-vs-ground" d="M0 68 L60 40 L110 20 L150 34 L220 60 L220 70 L0 70 Z" />
      <ellipse className="tile-vs-cloud" cx="78" cy="28" rx="15" ry="4.5" />
      <ellipse className="tile-vs-cloud tile-vs-cloud-b" cx="104" cy="14" rx="12" ry="3.5" />
      <path className="tile-vs-flow" d="M0 20 C60 18 90 3 110 3 C140 3 170 16 220 18" />
      <path className="tile-vs-flow" style={{ animationDelay: '-.9s' }} d="M0 30 C45 28 80 9 110 8 C150 8 175 30 220 36" />
      <path className="tile-vs-flow tile-vs-foehn" d="M0 38 C40 34 80 14 110 12 C135 11 150 30 175 40" />
    </svg>
    <div>
      <div className="tile-title tile-title-sm">Vertikalschnitt</div>
      <p className="tile-desc sm">Höhenwind, Böen, Windscherung, Strömungslinien und Wolkenbasis entlang einer frei gezogenen Linie.</p>
    </div>
  </>
);

// ---------------------------------------------------------------------------
// Ortssuche — bestehende Geocode-Logik, neu als Hero-Pille gestylt.
// ---------------------------------------------------------------------------
interface HeroSearchProps {
  onSelect: (loc: Location) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}
// `onOpenFeature` entfiel mit der Such-Fußzeile (2026-08-09) — die Ortssuche
// öffnet selbst kein Werkzeug mehr.
function HeroSearch({ onSelect, inputRef }: HeroSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Phone / tablet: tapping the field opens a full-screen search page with the same input (no page zoom, room for the keyboard,
  // results and saved places below). Desktop keeps the pill with its dropdown.
  const [sheet, setSheet] = useState(false);
  const closeSheet = () => {
    setSheet(false); setResults([]); setError(null);
    inputRef.current?.blur();
  };

  // Suggestions while typing (no Enter needed): after a short pause, from Photon; a newer keystroke cancels the older request.
  // Enter still runs the full Nominatim search below. Failures stay silent — the Enter path remains.
  const suggestAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    suggestAbort.current?.abort();
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    const ctl = new AbortController();
    suggestAbort.current = ctl;
    const t = window.setTimeout(() => {
      suggestDACH(q, ctl.signal)
        .then(list => { if (!ctl.signal.aborted) { setError(null); setResults(list); } })
        .catch(() => { /* silent */ });
    }, 300);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [query]);

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setResults([]); setError(null); setSheet(false); }
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
    suggestAbort.current?.abort();   // a late suggestion must not overwrite the Enter search
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
    <div className={`deck-search-wrap${showDropdown ? ' has-dropdown' : ''}${sheet ? ' is-sheet' : ''}`} ref={wrapRef}>
      {sheet && (
        <Suspense fallback={null}>
          <DachMapBackground />
        </Suspense>
      )}
      <div className="deck-search-head">
      <form className="deck-search" onSubmit={handleSubmit} role="search">
        <span className="deck-search-icon"><SearchIcon size={19} /></span>
        <input
          ref={inputRef}
          type="text"
          className="deck-search-input"
          placeholder="Stadt, Straße oder PLZ …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (!sheet && window.matchMedia('(max-width: 1024px), (pointer: coarse)').matches) setSheet(true); }}
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
        {sheet && (
          <button type="button" className="deck-sheet-back" onClick={closeSheet} aria-label="Suche schließen">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <line x1="4" y1="4" x2="14" y2="14" /><line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="deck-search-dropdown" role="listbox">
          {error && <div className="deck-search-error">⚠ {error}</div>}
          {results.map((r) => {
            // V-04: Der Stern muss ein EIGENER Button sein — ein Button im Button
            // wäre ungültiges HTML und für Tastatur/Screenreader unbedienbar.
            const loc = toLocation(r);
            return (
              <div key={r.place_id} className="deck-search-row">
                <button type="button" className="deck-search-result" onClick={() => pickResult(r)}>
                  <span className="deck-flag" aria-hidden="true">{flagFor(r.address?.country_code)}</span>
                  <span className="deck-result-name">{r.display_name}</span>
                </button>
                {loc && <FavoriteStar loc={loc} className="deck-search-star" />}
              </div>
            );
          })}
        </div>
      )}

      {sheet && <HeroFavorites onSelect={onSelect} />}

      {/* Auftrag Jan 2026-08-09: die Fußzeile „↵ Enter zum Suchen · Live-Daten
          aus DE · AT · CH · oder direkt in die DACH-Wetterkarte" ist entfernt.
          Funktionserhalt: Der Direkteinstieg in die Karte bleibt über Kachel 01
          und über die Befehlspalette (⌘K → „01 Wetterkarte") erreichbar; Enter
          im Suchfeld sucht unverändert. */}
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
  // V-04: Der Stern in den Suchergebnissen und im Punktforecast schreibt in
  // denselben Speicher — ohne Abo zeigte diese Leiste weiter den alten Stand.
  useEffect(() => subscribeFavorites(() => setFavs(getFavorites())), []);
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
      {/* Abgeleitet statt hartcodiert: stand hier bis Phase WB1 als „09 WERKZEUGE"
          und wäre bei der zehnten Kachel still falsch geworden. */}
      <span className="deck-chips-count">{String(toolTileCount()).padStart(2, '0')} WERKZEUGE</span>
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
function BentoGrid({ activeCat, onOpenFeature, narrow }: { activeCat: 'alle' | Category; onOpenFeature: (f: FeatureInfo) => void; narrow: boolean }) {
  // Dim-Logik: bei aktivem Filter alles ausblenden, was nicht zur Kategorie passt.
  // 04 + 05 stehen auf Desktop im Hero (HeroQuad) und nutzen dieselbe Fabrik.
  const tile = makeTile(activeCat, onOpenFeature);
  // Mobil nutzt dieselben kompakten Kachel-Inhalte wie der Desktop (Waldbrand, Regenradar, Gletscher, Autobahnwetter,
  // Seewetter, Globus, Historie, 3D-Wetter je eine Spalte); die Reihenfolge steht in SearchPage.css (≤ 767 px, `order`).
  const mobile = useMediaQuery(MOBILE_QUERY);
  const half = mobile ? ' t-half' : '';
  // 06 · HISTORIE / 07 · 3D-WETTER: auf ≤ 1024 px je eine Spalte der Reihe 06–09; auf Desktop seit 23.10.2026 (Jan)
  // darunter als zwei halbe Kacheln — ihre Plätze in der Reihe tragen Gletscher und Seewetter.
  const historyTile = tile(['verstehen'], 'tile-history t-half', FEATURE.history, 'Historie öffnen', TILE_HISTORY);
  const threedTile = tile(['erkunden'], 'tile-threed t-half', FEATURE.atmosphere, 'Atmosphäre / 3D-Wetter öffnen', TILE_THREED);
  // 12 · SEEWETTER (Phase SW, E-SW-8): kompakte Kachel (TILE_SEA) auf allen Breiten (Tablet seit 04.11.2026 wie Handy und Desktop). Hinter `SEA_LIVE`, `?sea=0` blendet aus.
  const seaTile = seaFlagFrom() && tile(['planen'], 'tile-coast t-half', FEATURE.sea, 'Seewetter öffnen', TILE_SEA);
  // 13 · GLETSCHER (Phase GL): kompakte Kachel (TILE_GLACIER) auf Tablet und Handy; auf Desktop steht sie im Hero (HeroQuad). Hinter `GLACIER_LIVE`.
  const glacierTile = glacierFlagFrom() && (!narrow ? null : tile(['planen'], 'tile-glacier t-half', FEATURE.glacier, 'Gletscherbericht öffnen', TILE_GLACIER));

  return (
    <section className="deck-bento" aria-label="Werkzeuge">
      {/* 01 · WETTERKARTE — groß (2×2) */}
      {tile(['radar'], 'tile-karte t-lg', FEATURE.map2d, 'Wetterkarte öffnen',
        <>
          <div className="tile-karte-text">
            <div className="tile-eyebrow">WETTERKARTE</div>
            <div className="tile-title tile-title-xl">{mobile ? 'Die ganze DACH-Wetterkarte' : <>Die ganze<br />DACH-Wetterkarte</>}</div>
            <p className="tile-desc">Wind, Niederschlag, Temperatur (höhenkorrigiert), Wolken, Satellit, Blitze und Stationen — mit Zeit-Slider und Modellwahl je Land. Direkt-Einstieg ohne Ortssuche.</p>
          </div>
          <DachMapPreview mobile={mobile} />
        </>)}

      {/* 02 · TOURENPLANUNG — dunkel, span 2 */}
      {tile(['planen'], 'tile-tour t-w2 t-ink', FEATURE.route, 'Tourenplanung öffnen',
        <>
          <div className="tile-head">
            <div>
              <div className="tile-eyebrow">TOURENPLANUNG</div>
              <div className="tile-title tile-title-lg">Wetter entlang deiner Route</div>
            </div>
            <span className="tile-badge badge-mono-ghost">E-BIKE</span>
          </div>
          <p className="tile-desc on-ink">GPX/TCX/FIT/KML hochladen — Wind, Regen und Temperatur pro km zur echten Ankunftszeit. 8 Bewegungsarten, E-Bike-Akku-Reichweite, Pausenplanung, Rücken-/Gegenwind.</p>
          <RouteHikerIcon />
        </>)}

      {/* 04 + 05: auf Desktop im Hero (HeroQuad); auf ≤1024 px hier im Grid an
          ihrer angestammten Stelle — so bleibt die schmale Ansicht wie zuvor. */}
      {narrow && (
        <>
          {tile(['erkunden'], `tile-fire${half}`, FEATURE.fire, 'Brandradar öffnen', TILE_FIRE)}
          {tile(['radar'], `tile-nowcast${half}`, FEATURE.nowcast, 'Regenradar / Nowcast öffnen', TILE_NOWCAST)}
        </>
      )}

      {/* 06–09 stehen als EINE Reihe zu vier Spalten (Jan, 2026-08-09). */}
      {/* Desktop: 13 · GLETSCHER · 12 · SEEWETTER · 08 · GLOBUS · 09 · FEEDBACK, darunter 06 · HISTORIE und 07 · 3D-WETTER.
          ≤ 1024 px unverändert: 06 · 07 · 08 · 09, Seewetter und Gletscher am Ende. */}
      {glacierTile}{roadFlagFrom() && tile(['planen'], 'tile-road t-half', FEATURE.road, 'Autobahn Monitor öffnen', TILE_ROAD)}{seaTile}

      {/* 08 · GLOBUS */}
      {tile(['erkunden'], 'tile-globus t-half', FEATURE.globe, '3D-Globus öffnen',
        <>
          <div className="tile-eyebrow">GLOBUS</div>
          <div className="tile-center">
            <GlobeIcon />
          </div>
          <div>
            <div className="tile-title tile-title-sm">3D-Globus</div>
            {/* Präzisiert: Wind IST live (globe/gfs.ts lädt den aktuellen GFS-Lauf
                per Range-Request), nur das Temperaturbild ist ein gebündeltes
                MERRA-2-Raster (globe/tempRecolor.ts). „Sample-Felder" war für den
                Wind schlicht falsch. */}
            <p className="tile-desc sm">Wind-Partikel live aus GFS. <span className="tile-caveat">Temperaturbild ist ein gebündeltes Raster, keine Live-Analyse.</span></p>
          </div>
        </>)}

      {/* 09 · FEEDBACK (an Stelle des Mock-Tiles „KI-Meteorologe") — dunkel, span 2 */}
      {tile([], 'tile-feedback t-half t-ink2', FEATURE.feedback, 'Feedback geben',
        <>
          <div className="tile-feedback-icon" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z" fill="var(--amber-500)" />
            </svg>
          </div>
          <div className="tile-feedback-body">
            <div className="tile-eyebrow">FEEDBACK</div>
            <div className="tile-title tile-title-lg">Ideen, Wünsche & Fehler melden</div>
            <p className="tile-desc on-ink">Was sollen wir verbessern, was fehlt dir? Schick uns deine Anregung direkt per E-Mail — ohne Konto, ohne Tracker. Jede Rückmeldung fließt in die nächste Ausbaustufe.</p>
          </div>
          <span className="tile-badge badge-mono-ghost">E-MAIL</span>
        </>)}

      {historyTile}{threedTile}

      {/* 10 · WALDBRAND steht seit 2026-10-03 (Jan) links neben dem Regenradar: auf Desktop im
          Hero (HeroQuad), auf ≤1024 px im narrow-Block oben (TILE_FIRE). */}
      {/* 11 · AUTOBAHNWETTER (Phase AW, E-AW-5): auf Desktop im Hero (HeroQuad, TILE_ROAD); auf Tablet und Handy hier als kompakte Kachel
          (Jan 04.11.: die alte Vollbreiten-Kachel auf Tablet entfällt). Lädt keine Daten. `?road=0` blendet aus. */}
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

/* Der Block „Ehrlich bleiben" wurde auf Jans Wunsch (2026-08-09) von der
   Startseite entfernt. Die Grenzen stehen weiterhin in den jeweiligen
   Werkzeugen (Datenlage/Ehrlichkeits-Hinweise) und in der Doku. */

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
              <button type="button" onClick={() => onOpenFeature(FEATURE.route)}>Touren</button><br />
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
              {roadFlagFrom() && (<><br /><button type="button" onClick={() => onOpenFeature(FEATURE.road)}>Autobahnwetter</button></>)}
              {seaFlagFrom() && (<><br /><button type="button" onClick={() => onOpenFeature(FEATURE.sea)}>Seewetter</button></>)}
              {glacierFlagFrom() && (<><br /><button type="button" onClick={() => onOpenFeature(FEATURE.glacier)}>Gletscher</button></>)}
            </div>
          </div>
          {/* Rechtsseiten werden vom SEO-Generator als echte Pfade erzeugt →
              normale <a>-Links, kein Router nötig (D-06). Ohne sie wäre das
              Impressum aus der App heraus nicht erreichbar (V-103). */}
          {/* SEO/GEO 2026 (E2): die statischen Seitenfamilien aus der App verlinken —
              vorher hingen 190 Seiten nur an der Sitemap (SEO-AUDIT.md §7). */}
          <div className="deck-footer-col">
            <div className="deck-footer-h">ENTDECKEN</div>
            <div className="deck-footer-links">
              <a href="/wetter/">Wetter nach Ort</a><br />
              <a href="/wissen/">Wetterwissen</a><br />
              <a href="/funktionen/">Alle Funktionen</a><br />
              <a href="/wetterlage/">Wetterlagen</a><br />
              <a href="/methodik/">Methodik</a><br />
              <a href="/ueber/">Über buscosun</a><br />
              <a href="/fuer/">Für wen</a><br />
              <a href="/glossar/">Glossar</a><br />
              <a href="/ohne-tracker/">Ohne Tracker</a>
            </div>
          </div>
          <div className="deck-footer-col">
            <div className="deck-footer-h">RECHTLICHES</div>
            <div className="deck-footer-links">
              <a href="/impressum/">Impressum</a><br />
              <a href="/datenschutz/">Datenschutz</a><br />
              {/* V-104: zentrales Quellen- und Attributionsverzeichnis. */}
              <a href="/lizenzen/">Quellen &amp; Lizenzen</a><br />
              <a href="/kontakt/">Kontakt</a>
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
    const entries = PALETTE.filter((p) => (p.feature.id !== 'road' || roadFlagFrom()) && (p.feature.id !== 'sea' || seaFlagFrom()) && (p.feature.id !== 'glacier' || glacierFlagFrom()));
    if (!q) return entries;
    return entries.filter((p) => `${p.label} ${p.hint} ${p.feature.eyebrow}`.toLowerCase().includes(q));
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
