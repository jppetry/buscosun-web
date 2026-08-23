import { Suspense, useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import type { Location } from './types';
import AppLoader from './router/AppLoader';
import RouteMeta from './router/RouteMeta';
import RouteAnnouncer from './router/RouteAnnouncer';
import { normalizePath } from './router/routes';
import './fonts.css';
import './designTokens.css';

// Seit Phase RT1 (2026-08-22) ist App das ROOT-LAYOUT des Routers: die Seiten
// sind Routen (`src/router/router.tsx`, je Seite ein Lazy-Chunk — auch die
// Startseite), der Zustand lebt in Pfad + Query (`src/router/urlState.ts`) bzw.
// weiterhin im Fragment der Feature-Codecs. Die frühere View-Maschine
// (`useState<View>`, Hash-Lesen beim Mount) ist ersetzt; Alt-Links migriert
// `src/router/legacyHash.ts` in `main.tsx`, bevor der Router die URL liest.

export type FeatureId = 'route' | 'event' | 'dayflow' | 'forecast' | 'nowcast' | 'atmosphere' | 'history' | 'globe' | 'map2d' | 'fire' | 'feedback' | 'validation' | 'mobiletest';

/** Standort-Default für die 2D-Karten-Kachel (ohne Ortssuche): DACH-Überblick,
 *  zentriert auf Mitteleuropa. Marker/Punktpanel sind im overview-Modus aus. */
export const DACH_OVERVIEW_LOCATION: Location = { name: 'Deutschland · Österreich · Schweiz', lat: 50.2, lon: 10.5, country: 'DE' };

export interface FeatureInfo {
  id: FeatureId;
  eyebrow: string;
  title: string;
}

export default function App() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  // Kanonischer Pfad: End-Slash, Großschreibung und Aliase werden per `replace`
  // bereinigt. Netlify kann den Slash-Fall nicht (Regel `/x/ → /x` ist dort eine
  // Endlosschleife), darum hier — der Canonical-Link zeigt ohnehin auf den Pfad ohne Slash.
  useEffect(() => {
    const n = normalizePath(pathname);
    if (n) void navigate(n + search + hash, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      <RouteMeta />
      <RouteAnnouncer />
      <ScrollRestoration />
      <Suspense fallback={<AppLoader />}>
        <Outlet />
      </Suspense>
    </>
  );
}
