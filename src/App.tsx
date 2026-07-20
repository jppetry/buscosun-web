import { lazy, Suspense, useState } from 'react';
import SearchPage from './SearchPage';
import type { Location } from './types';
import type { LayerKey, MapDeckFeature } from './MapView';
import { decodeMapState } from './mapState';
import { hasEventHash } from './event/eventState';
import './designTokens.css';

// Code-Splitting: nur die Startseite (Default-Landing) wird eager geladen. Alle
// Feature-Seiten — inkl. der schweren MapView (zieht maplibre-gl) und des
// WebGL-Globus — laden lazy als eigener Chunk, erst wenn der Nutzer sie öffnet.
// Das hält den Initial-Bundle der Startseite klein (vorher: ein 2,3-MB-Monolith
// für ALLE Routen). Suspense-Fallback überbrückt den Chunk-Download.
const MapView = lazy(() => import('./MapView'));
const FeaturePage = lazy(() => import('./feature/FeaturePage'));
const RoutePage = lazy(() => import('./route/RoutePage'));
const EventPage = lazy(() => import('./event/EventPage'));
const NowcastPage = lazy(() => import('./nowcast/NowcastPage'));
const ForecastPage = lazy(() => import('./confidence/ForecastPage'));
const HistoryPage = lazy(() => import('./history/HistoryPage'));
const GlobePage = lazy(() => import('./globe/GlobePage'));
const AtmospherePage = lazy(() => import('./atmosphere/AtmospherePage'));
const FeedbackPage = lazy(() => import('./feedback/FeedbackPage'));
const ValidationPage = lazy(() => import('./validation/ValidationPage'));
// Phase-0-Scaffold (Mobile-Optimierung): nur über #mobiletest erreichbar, keine UI-Verlinkung,
// kein Einfluss auf Produktions-Layout. Wird entfernt, sobald Phase 1 die Primitives direkt nutzt.
const MobilePrimitivesTestPage = lazy(() => import('./mobile/MobilePrimitivesTestPage'));

export type FeatureId = 'route' | 'event' | 'dayflow' | 'forecast' | 'nowcast' | 'atmosphere' | 'history' | 'globe' | 'map2d' | 'feedback' | 'validation' | 'mobiletest';

/** Standort-Default für die 2D-Karten-Kachel (ohne Ortssuche): DACH-Überblick,
 *  zentriert auf Mitteleuropa. Marker/Punktpanel sind im overview-Modus aus. */
const DACH_OVERVIEW_LOCATION: Location = { name: 'Deutschland · Österreich · Schweiz', lat: 50.2, lon: 10.5, country: 'DE' };

export interface FeatureInfo {
  id: FeatureId;
  eyebrow: string;
  title: string;
}

type View =
  | { kind: 'search' }
  | { kind: 'map'; location: Location; mapInit?: { layers: LayerKey[]; hour: number } }
  | { kind: 'feature'; feature: FeatureInfo };

/** Leichter, marken-getönter Fallback während ein Lazy-Seiten-Chunk lädt.
 *  Selbsttragend gestylt (designTokens.css ist eager geladen), damit kein
 *  seiten-spezifisches CSS nötig ist, das ja erst mit dem Chunk käme. */
function AppLoader() {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'var(--cream-50, #FAF6EA)', color: 'var(--stone-600, #5C5447)',
        fontFamily: 'var(--font-base, ui-sans-serif, system-ui, -apple-system, sans-serif)',
      }}
    >
      <style>{'@keyframes app-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '3px solid var(--sand-200, #E0D6BE)',
            borderTopColor: 'var(--terracotta-500, #C97B47)',
            animation: 'app-spin 0.8s linear infinite',
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: '0.9rem' }}>lädt …</span>
      </div>
    </div>
  );
}

export default function App() {
  // Permalink: mit dem passenden Hash direkt in die jeweilige Ansicht starten —
  // #3d= 3D-Wetter · #h= Historie · #ev= Event-Planung · #m= 2D-Karte.
  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return { kind: 'search' };
    const h = window.location.hash;
    // #3d= = alter threed-Permalink → in die Atmosphäre (Schnitt-Linse) migriert.
    if (h.startsWith('#3d=') || h.startsWith('#atm=')) return { kind: 'feature', feature: { id: 'atmosphere', eyebrow: 'Atmosphäre', title: 'Die Atmosphäre über dir' } };
    if (h.startsWith('#h=')) return { kind: 'feature', feature: { id: 'history', eyebrow: 'Historie', title: 'Wie hat sich das Wetter bei dir verändert?' } };
    if (h.startsWith('#val')) return { kind: 'feature', feature: { id: 'validation', eyebrow: 'Validierung', title: 'Wie gut ist der KI-Nowcast wirklich?' } };
    if (h.startsWith('#g=')) return { kind: 'feature', feature: { id: 'globe', eyebrow: 'Globale Wetter-Visualisierung', title: 'Das Wetter der ganzen Erde' } };
    if (h.startsWith('#mobiletest')) return { kind: 'feature', feature: { id: 'mobiletest', eyebrow: 'Mobile-Primitives', title: 'Testroute' } };
    if (hasEventHash(h)) return { kind: 'feature', feature: { id: 'event', eyebrow: 'Event-Planung', title: 'Welcher Tag passt am besten?' } };
    const m = decodeMapState(h);
    if (m) return { kind: 'map', location: m.location, mapInit: { layers: m.layers, hour: m.hour } };
    return { kind: 'search' };
  });

  // Zurück zur Startseite — räumt einen evtl. gesetzten Permalink-Hash auf.
  const goSearch = () => {
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setView({ kind: 'search' });
  };

  // Deck-Rail/Bottom-Bar der Kartenseite: Navigation zu anderen Werkzeugen
  // (gleiche FeatureInfo-Texte wie die Startseiten-Kacheln).
  const DECK_FEATURES: Record<MapDeckFeature, FeatureInfo> = {
    nowcast: { id: 'nowcast', eyebrow: 'Regenradar', title: 'Regnet es in 40 Minuten?' },
    forecast: { id: 'forecast', eyebrow: 'Vorhersage', title: 'Konfidenz & Modelle' },
    event: { id: 'event', eyebrow: 'Event-Planung', title: 'Welcher Tag passt am besten?' },
  };
  const openDeckFeature = (id: MapDeckFeature) => setView({ kind: 'feature', feature: DECK_FEATURES[id] });
  const selectMapLocation = (location: Location) => setView({ kind: 'map', location });

  // Aktuelle Ansicht als Element bestimmen; Lazy-Komponenten werden vom
  // umschließenden <Suspense> abgefedert.
  let content: React.ReactNode;
  if (view.kind === 'map') {
    content = <MapView location={view.location} initialActive={view.mapInit?.layers} initialHour={view.mapInit?.hour} onBack={goSearch} onOpenFeature={openDeckFeature} onSelectLocation={selectMapLocation} />;
  } else if (view.kind === 'feature') {
    const back = goSearch;
    const f = view.feature;
    content =
      f.id === 'map2d' ? <MapView location={DACH_OVERVIEW_LOCATION} overview onBack={back} onOpenFeature={openDeckFeature} onSelectLocation={selectMapLocation} /> :
      f.id === 'route' ? <RoutePage onBack={back} /> :
      f.id === 'event' ? <EventPage onBack={back} /> :
      f.id === 'nowcast' ? <NowcastPage onBack={back} /> :
      f.id === 'atmosphere' ? <AtmospherePage onBack={back} /> :
      f.id === 'forecast' ? <ForecastPage onBack={back} /> :
      f.id === 'history' ? <HistoryPage onBack={back} /> :
      f.id === 'globe' ? <GlobePage onBack={back} /> :
      f.id === 'feedback' ? <FeedbackPage onBack={back} /> :
      f.id === 'validation' ? <ValidationPage onBack={back} /> :
      f.id === 'mobiletest' ? <MobilePrimitivesTestPage onBack={back} /> :
      <FeaturePage eyebrow={f.eyebrow} title={f.title} onBack={back} />;
  } else {
    content = (
      <SearchPage
        onSelect={(location) => setView({ kind: 'map', location })}
        onOpenFeature={(feature) => setView({ kind: 'feature', feature })}
      />
    );
  }

  return <Suspense fallback={<AppLoader />}>{content}</Suspense>;
}
