import { useState } from 'react';
import SearchPage from './SearchPage';
import MapView from './MapView';
import FeaturePage from './feature/FeaturePage';
import RoutePage from './route/RoutePage';
import EventPage from './event/EventPage';
import NowcastPage from './nowcast/NowcastPage';
import ThreeDPage from './threed/ThreeDPage';
import ForecastPage from './confidence/ForecastPage';
import HistoryPage from './history/HistoryPage';
import GlobePage from './globe/GlobePage';
import GoNoGoPage from './gonogo/GoNoGoPage';
import ValidationPage from './validation/ValidationPage';
import type { Location } from './types';
import type { LayerKey } from './MapView';
import { decodeMapState } from './mapState';
import { hasEventHash } from './event/eventState';
import './designTokens.css';

export type FeatureId = 'route' | 'event' | 'dayflow' | 'forecast' | 'nowcast' | 'threed' | 'history' | 'globe' | 'map2d' | 'gonogo' | 'validation';

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

export default function App() {
  // Permalink: mit dem passenden Hash direkt in die jeweilige Ansicht starten —
  // #3d= 3D-Wetter · #h= Historie · #ev= Event-Planung · #m= 2D-Karte.
  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return { kind: 'search' };
    const h = window.location.hash;
    if (h.startsWith('#3d=')) return { kind: 'feature', feature: { id: 'threed', eyebrow: '3D-Wetterdaten', title: 'Atmosphäre in drei Dimensionen' } };
    if (h.startsWith('#h=')) return { kind: 'feature', feature: { id: 'history', eyebrow: 'Historie', title: 'Wie hat sich das Wetter bei dir verändert?' } };
    if (h.startsWith('#val')) return { kind: 'feature', feature: { id: 'validation', eyebrow: 'Validierung', title: 'Wie gut ist der KI-Nowcast wirklich?' } };
    if (h.startsWith('#g=')) return { kind: 'feature', feature: { id: 'globe', eyebrow: 'Globale Wetter-Visualisierung', title: 'Das Wetter der ganzen Erde' } };
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

  if (view.kind === 'map') {
    return <MapView location={view.location} initialActive={view.mapInit?.layers} initialHour={view.mapInit?.hour} onBack={goSearch} />;
  }
  if (view.kind === 'feature') {
    const back = goSearch;
    if (view.feature.id === 'map2d') {
      return <MapView location={DACH_OVERVIEW_LOCATION} overview onBack={back} />;
    }
    if (view.feature.id === 'route') {
      return <RoutePage onBack={back} />;
    }
    if (view.feature.id === 'event') {
      return <EventPage onBack={back} />;
    }
    if (view.feature.id === 'nowcast') {
      return <NowcastPage onBack={back} />;
    }
    if (view.feature.id === 'threed') {
      return <ThreeDPage onBack={back} />;
    }
    if (view.feature.id === 'forecast') {
      return <ForecastPage onBack={back} />;
    }
    if (view.feature.id === 'history') {
      return <HistoryPage onBack={back} />;
    }
    if (view.feature.id === 'globe') {
      return <GlobePage onBack={back} />;
    }
    if (view.feature.id === 'gonogo') {
      return <GoNoGoPage onBack={back} />;
    }
    if (view.feature.id === 'validation') {
      return <ValidationPage onBack={back} />;
    }
    return (
      <FeaturePage
        eyebrow={view.feature.eyebrow}
        title={view.feature.title}
        onBack={back}
      />
    );
  }
  return (
    <SearchPage
      onSelect={(location) => setView({ kind: 'map', location })}
      onOpenFeature={(feature) => setView({ kind: 'feature', feature })}
    />
  );
}
